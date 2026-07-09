import { randomUUID } from 'node:crypto';
import { callLLM, MODELS } from '../llm/adapter.js';
import type { ParsedSource } from '../parsers/index.js';
import { DEMO_PROFILE, type Profile } from './profile.js';
import {
  getSessionProfile,
  hasSessionData,
  sealSession,
  sessionDocMeta,
  sessionSources,
} from './session.js';
import { runStage1 } from './stage1.js';
import { runStage2 } from './stage2.js';
import { runStage3a, runStage3b } from './stage3.js';
import type { Question, RoadmapItem, WorkMap } from './types.js';

export type AnalyzeResult = { workMap: WorkMap; roadmap: RoadmapItem[]; questions: Question[] };

export type SourceStatus = 'waiting' | 'parsing' | 'extracting' | 'done' | 'stuck';
export type SourceProgress = { source: string; status: SourceStatus; count: number };
// 스테이지 경과·토큰: 클라이언트가 startedAt으로 경과 시간을, tokens로 생성량을 표시
export type StageTiming = { startedAt: number; tokens?: number; stuck?: boolean };

export type Job = {
  id: string;
  status: 'running' | 'done' | 'error';
  stage: string; // 'parse' | 'stage1' | 'stage2' | 'confirm' | 'stage3' | 'done'
  stageDetail: string;
  error?: string;
  result?: AnalyzeResult;
  profile: Profile;
  sources: SourceProgress[];
  timings: Record<string, StageTiming>; // stage2 / stage3a / stage3b
  stuck: boolean; // 현재 스테이지가 타임아웃 임계를 넘김
  stuckStage?: string;
  // 직무 확인 체크포인트: stage2 직후 추정 직무를 노출하고 사용자 확인을 기다린다.
  pendingRole?: string; // stage === 'confirm'일 때 확인 대기 중인 추정 직무
  confirmResolver?: (role: string | undefined) => void; // 확인 시 파이프라인 재개 (undefined=미변경)
};

const jobs = new Map<string, Job>();
let latestDoneJobId: string | null = null;

// 캐시 히트 시 전 파이프라인이 1초 내에 끝나 진행 연출이 안 보인다.
// 스테이지 전환마다 최소 체류 시간을 둬서 오버레이가 읽히게 한다. (데모 연출용, DEMO_PACE_MS=0으로 끄기)
const PACE_MS = Number(process.env.DEMO_PACE_MS ?? 1800);
// 스테이지가 이 시간을 넘기면 stuck 표시 (UI가 "지연 — 재시도" 노출). LLM 하드 타임아웃보다 짧게.
const STUCK_MS = Number(process.env.STAGE_STUCK_MS ?? 300_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function paced(job: Job, stage: string, detail: string) {
  job.stage = stage;
  job.stageDetail = detail;
  if (PACE_MS > 0) await sleep(PACE_MS);
}

// 스테이지 실행을 watchdog로 감싼다: STUCK_MS 초과 시 job.stuck=true (계속 진행은 하되 UI가 재시도 안내)
async function withStuckWatch<T>(job: Job, stage: string, run: () => Promise<T>): Promise<T> {
  job.stuck = false;
  job.stuckStage = undefined;
  const wd = setTimeout(() => {
    job.stuck = true;
    job.stuckStage = stage;
    if (job.timings[stage]) job.timings[stage].stuck = true;
    console.warn(`[pipeline] ${stage} ${STUCK_MS / 1000}s 초과 — stuck 표시`);
  }, STUCK_MS);
  try {
    return await run();
  } finally {
    clearTimeout(wd);
  }
}

function startTiming(job: Job, key: string): StageTiming {
  const t: StageTiming = { startedAt: Date.now() };
  job.timings[key] = t;
  return t;
}

async function runPipeline(job: Job) {
  try {
    // 항상 업로드 세션 소스만 사용한다 — 데모는 명시적 로드로 세션에 들어와 있어야 함(혼합 금지)
    if (!hasSessionData()) {
      throw new Error('분석할 데이터가 없습니다. 파일을 업로드하거나 데모 데이터를 불러오세요.');
    }
    await paced(job, 'parse', '연동된 소스에서 데이터 수집 중…');
    const parsed: ParsedSource[] = sessionSources();
    const docMeta = sessionDocMeta();
    job.sources = parsed.map((p) => ({ source: p.source, status: 'waiting', count: p.count }));

    // Stage 1: 소스별 실시간 상태 (extracting → done, 카운트 포함)
    job.stage = 'stage1';
    job.stageDetail = '소스별 업무 단서 추출 중…';
    const setSrc = (source: string, status: SourceStatus) => {
      const s = job.sources.find((x) => x.source === source);
      if (s) s.status = status;
    };
    job.sources.forEach((s) => (s.status = 'extracting'));
    const findings = await withStuckWatch(job, 'stage1', () =>
      runStage1(
        parsed,
        undefined,
        job.profile,
        (source, status) => setSrc(source, status),
      ),
    );

    // Stage 2: 종합 (스트리밍 토큰 카운트)
    await paced(job, 'stage2', `${parsed.length}개 소스의 지식을 하나의 업무 지도로 종합 중…`);
    const t2 = startTiming(job, 'stage2');
    const workMap = await withStuckWatch(job, 'stage2', () =>
      runStage2(findings, job.profile, (tokens) => (t2.tokens = tokens)),
    );

    // 직무 확인 체크포인트: stage2가 확정한 추정 직무가 실제와 맞는지 확인받는다.
    // watchdog 밖에서 대기하므로 stuck 오판 없음. 타임아웃 없음(사용자가 자리를 비울 수 있음).
    job.stage = 'confirm';
    job.stageDetail = '직무 확인 대기 중';
    job.pendingRole = workMap.person.inferredRole;
    const roleOverride = await new Promise<string | undefined>((resolve) => {
      job.confirmResolver = resolve;
    });
    job.confirmResolver = undefined;
    job.pendingRole = undefined;
    // 수정된 경우에만 workMap을 변형한다(미수정 시 stage3 입력이 바이트 동일 → 데모 캐시 히트 보존).
    if (roleOverride) workMap.person.inferredRole = roleOverride;

    // Stage 3: 로드맵 + 역질문 (각각 시작 시각·토큰)
    await paced(job, 'stage3', '온보딩 로드맵 설계 + 기록되지 않은 지식 탐지 중…');
    const t3a = startTiming(job, 'stage3a');
    const t3b = startTiming(job, 'stage3b');
    const [roadmap, questions] = await withStuckWatch(job, 'stage3', () =>
      Promise.all([
        runStage3a(workMap, job.profile, (tokens) => (t3a.tokens = tokens), roleOverride),
        runStage3b(workMap, docMeta, job.profile, (tokens) => (t3b.tokens = tokens), roleOverride),
      ]),
    );

    job.result = { workMap, roadmap, questions };
    job.stage = 'done';
    job.stageDetail = '분석 완료';
    job.status = 'done';
    job.stuck = false;
    latestDoneJobId = job.id;
    sealSession(); // 다음 업로드는 새 분석으로 격리
  } catch (e) {
    job.status = 'error';
    job.error = (e as Error).message;
    console.error('[pipeline] 실패:', e);
  }
}

export function startAnalyze(): Job {
  const profile = getSessionProfile() ?? DEMO_PROFILE;
  const job: Job = {
    id: randomUUID(),
    status: 'running',
    stage: 'parse',
    stageDetail: '시작 중…',
    profile,
    sources: [],
    timings: {},
    stuck: false,
  };
  jobs.set(job.id, job);
  void runPipeline(job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function latestResult(): AnalyzeResult | undefined {
  return latestDoneJobId ? jobs.get(latestDoneJobId)?.result : undefined;
}

// POST /api/analyze/:jobId/role — 직무 확인 체크포인트 응답으로 파이프라인 재개.
// inferredRole 미전달/빈값/기존값과 동일(trim 비교) → 미변경(undefined)으로 재개 → 캐시 보존.
// 다른 값 → 그 값으로 재개 → workMap 반영 + stage3 프롬프트에 직무 주입.
export function confirmRole(
  jobId: string,
  inferredRole?: string,
): { ok: true } | { status: number; error: string } {
  const job = jobs.get(jobId);
  if (!job) return { status: 404, error: 'job not found' };
  if (job.stage !== 'confirm' || !job.confirmResolver)
    return { status: 409, error: '직무 확인 단계가 아닙니다.' };
  const current = (job.pendingRole ?? '').trim();
  const next = (inferredRole ?? '').trim();
  const resolve = job.confirmResolver;
  job.confirmResolver = undefined;
  resolve(!next || next === current ? undefined : next);
  return { ok: true };
}

// ---- 인터뷰 답변 → 업무 지도 편입 ----

type AnswerPatch = {
  answerSummary: string;
  card: { title: string; body: string };
  patch:
    | { kind: 'landmine'; landmine: { title: string; whatHappened: string; whyItMatters: string; doNot: string } }
    | { kind: 'note'; targetId: string; note: string };
};

const answerSystem = (name: string) => `너는 전임자(${name})의 인터뷰 답변을 인수인계 '업무 지도'에 편입하는 역할이다.
판단 기준:
- 답변이 과거 사건의 전말·처리 방식·재발 시 대응이면 patch.kind = "landmine"으로 새 주의 항목을 만든다.
- 답변이 기존 업무·진행 건의 현재 상태나 보충 설명이면 patch.kind = "note"로, 제공된 항목 목록에서 가장 관련 있는 targetId를 골라 1~2문장 note를 만든다.
- card는 후임자가 지도에서 볼 카드: title은 질문 주제를 12자 내외로, body는 답변 핵심을 2~3문장으로 정리.
- answerSummary는 답변 원문을 1~2문장으로 요약 (근거 인용으로 쓰임).

아래 TypeScript 타입에 맞는 JSON만 출력하라. 필드명을 정확히 지켜라. 설명 문장 금지.

type Output = {
  answerSummary: string;
  card: { title: string; body: string };
  patch:
    | { kind: 'landmine'; landmine: { title: string; whatHappened: string; whyItMatters: string; doNot: string } }
    | { kind: 'note'; targetId: string; note: string };
};`;

export async function saveAnswerAndIncorporate(
  questionId: string,
  answer: string,
): Promise<{ card: { title: string; body: string }; workMap: WorkMap } | null> {
  for (const job of jobs.values()) {
    const q = job.result?.questions.find((q) => q.id === questionId);
    if (!q || !job.result) continue;
    q.answer = answer;

    const map = job.result.workMap;
    const targets = [
      ...map.duties.map((d) => ({ id: d.id, title: d.title })),
      ...map.ongoing.map((o) => ({ id: o.id, title: o.title })),
    ];
    const patch = await callLLM<AnswerPatch>({
      system: answerSystem(job.profile.name),
      user: `질문(구멍 유형 ${q.gapType}): ${q.question}\n관찰된 사실: ${q.observation}\n\n전임자 답변: ${answer}\n\n지도 항목 목록(targetId 후보): ${JSON.stringify(targets)}`,
      schemaName: 'answer-patch',
      model: MODELS.stage1,
      maxTokens: 1500,
      cache: false, // 답변은 매번 다름
    });

    const evidence = { source: 'interview' as const, ref: '전임자 답변', quote: patch.answerSummary };
    if (patch.patch.kind === 'landmine') {
      map.landmines.push({
        id: `l-int-${questionId}`,
        ...patch.patch.landmine,
        evidence: [evidence],
      });
    } else {
      const { targetId, note } = patch.patch;
      const duty = map.duties.find((d) => d.id === targetId);
      const going = map.ongoing.find((o) => o.id === targetId);
      if (duty) {
        duty.summary += `\n💬 전임자: ${note}`;
        duty.evidence.push(evidence);
      } else if (going) {
        going.status += ` · 💬 전임자: ${note}`;
        going.evidence.push(evidence);
      } else {
        // targetId가 유효하지 않으면 landmine 형태로라도 남긴다 (정보 유실 방지)
        map.landmines.push({
          id: `l-int-${questionId}`,
          title: patch.card.title,
          whatHappened: q.observation,
          whyItMatters: q.whyNeeded,
          doNot: note,
          evidence: [evidence],
        });
      }
    }
    return { card: patch.card, workMap: map };
  }
  return null;
}
