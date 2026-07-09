import '../env.js';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// 게이트웨이는 OpenAI 호환(chat/completions)만 지원 — 7/9 스모크 테스트로 확인
// (Anthropic /v1/messages는 404)
const BASE_URL = process.env.LLM_BASE_URL ?? 'https://jiran-llm.algorix.services/v1';
const API_KEY = process.env.LLM_API_KEY ?? process.env.AI_API_KEY ?? '';

export const MODELS = {
  stage1: process.env.LLM_MODEL_STAGE1 ?? 'claude-sonnet-5',
  stage2: process.env.LLM_MODEL_STAGE2 ?? 'claude-opus-4.8',
};

const CACHE_DIR = path.resolve(process.cwd(), process.cwd().endsWith('server') ? '../cache' : 'cache');

export type LLMCall = {
  system: string;
  user: string;
  schemaName: string; // 로그·캐시 키 식별용 (예: 'stage1-email')
  model?: string;
  maxTokens?: number;
  cache?: boolean; // 같은 입력이면 캐시 반환 (프롬프트 튜닝 루프용)
  // 지정 시 스트리밍(SSE)으로 호출하고 생성 토큰 수를 주기적으로 콜백 (진행 표시용)
  onToken?: (tokens: number) => void;
  // 호출 하드 타임아웃(ms). 초과 시 abort → 에러. 기본 5분.
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 300_000);

// 생성 토큰 수 추정: 게이트웨이가 usage를 안 줄 때 문자 수 기반 근사(한국어 ≈ 2자/토큰)
const estimateTokens = (chars: number) => Math.round(chars / 2);

function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  // 앞뒤 설명 문장이 섞였을 때 첫 { ~ 마지막 } 구간만 시도
  if (!t.startsWith('{') && !t.startsWith('[')) {
    const start = t.search(/[{[]/);
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (start >= 0 && end > start) t = t.slice(start, end + 1);
  }
  return JSON.parse(t);
}

function withTimeout(timeoutMs: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

async function postChat(body: object, signal: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('LLM 호출 타임아웃');
    throw e;
  }
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res;
}

async function chatOnce(system: string, user: string, model: string, maxTokens: number, timeoutMs: number): Promise<string> {
  const { signal, done } = withTimeout(timeoutMs);
  try {
    const res = await postChat(
      {
        model,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      signal,
    );
    const data = (await res.json()) as {
      choices: { message: { content: string }; finish_reason: string }[];
    };
    const choice = data.choices?.[0];
    if (!choice?.message?.content) throw new Error(`LLM 빈 응답: ${JSON.stringify(data).slice(0, 300)}`);
    if (choice.finish_reason === 'length') throw new Error('LLM 응답이 max_tokens에서 잘림 — maxTokens를 늘려라');
    return choice.message.content;
  } finally {
    done();
  }
}

// SSE 스트리밍: content 조각을 누적하면서 생성 토큰 수를 주기적으로 콜백. 최종 전체 텍스트 반환.
async function chatStream(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
  timeoutMs: number,
  onToken: (tokens: number) => void,
): Promise<string> {
  const { signal, done } = withTimeout(timeoutMs);
  try {
    const res = await postChat(
      {
        model,
        temperature: 0,
        max_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      signal,
    );
    if (!res.body) throw new Error('LLM 스트림 body 없음');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let content = '';
    let usageTokens = 0;
    let finish: string | null = null;
    let lastEmit = 0;

    for (;;) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? ''; // 마지막 미완성 라인 보존
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const payload = s.slice(5).trim();
        if (payload === '[DONE]') continue;
        let chunk: any;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue; // 부분 라인은 건너뛴다
        }
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) content += delta;
        if (chunk.choices?.[0]?.finish_reason) finish = chunk.choices[0].finish_reason;
        if (chunk.usage?.completion_tokens) usageTokens = chunk.usage.completion_tokens;
        // 200자마다 진행 콜백 (과도한 폴링 방지)
        if (content.length - lastEmit >= 200) {
          lastEmit = content.length;
          onToken(usageTokens || estimateTokens(content.length));
        }
      }
    }
    onToken(usageTokens || estimateTokens(content.length));
    if (!content) throw new Error('LLM 스트림 빈 응답');
    if (finish === 'length') throw new Error('LLM 응답이 max_tokens에서 잘림 — maxTokens를 늘려라');
    return content;
  } finally {
    done();
  }
}

export async function callLLM<T = unknown>(opts: LLMCall): Promise<T> {
  const model = opts.model ?? MODELS.stage1;
  const maxTokens = opts.maxTokens ?? 8000;

  let cacheFile: string | undefined;
  if (opts.cache !== false) {
    const hash = createHash('sha256').update(`${model}\n${opts.system}\n${opts.user}`).digest('hex').slice(0, 12);
    cacheFile = path.join(CACHE_DIR, `${opts.schemaName}-${hash}.json`);
    if (existsSync(cacheFile)) {
      console.log(`[llm] ${opts.schemaName} 캐시 히트 (${path.basename(cacheFile)})`);
      return JSON.parse(readFileSync(cacheFile, 'utf8')) as T;
    }
  }

  const t0 = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  console.log(`[llm] ${opts.schemaName} → ${model} 호출…${opts.onToken ? ' (stream)' : ''}`);
  const call = (system: string, user: string) =>
    opts.onToken
      ? chatStream(system, user, model, maxTokens, timeoutMs, opts.onToken)
      : chatOnce(system, user, model, maxTokens, timeoutMs);
  const raw = await call(opts.system, opts.user);

  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch (e) {
    // 파싱 실패 시 에러 메시지 첨부 1회 재시도 (공통 규약)
    console.warn(`[llm] ${opts.schemaName} JSON 파싱 실패, 재시도: ${(e as Error).message}`);
    const retryUser = `${opts.user}\n\n---\n이전 응답이 JSON 파싱에 실패했다: ${(e as Error).message}\n이전 응답(앞부분): ${raw.slice(0, 500)}\n설명 없이 유효한 JSON만 다시 출력하라.`;
    const raw2 = await call(opts.system, retryUser);
    parsed = extractJson(raw2);
  }

  console.log(`[llm] ${opts.schemaName} 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (cacheFile) {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(parsed, null, 2));
  }
  return parsed as T;
}
