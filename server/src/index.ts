import './env.js';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import {
  confirmRole,
  getJob,
  latestResult,
  saveAnswerAndIncorporate,
  startAnalyze,
} from './pipeline/jobs.js';
import { buildHandoverMarkdown } from './pipeline/exportMd.js';
import { realProfile } from './pipeline/profile.js';
import {
  getSessionProfile,
  ingestFile,
  loadDemoIntoSession,
  resetSession,
  sessionSummary,
  setSessionProfile,
  type IngestResult,
} from './pipeline/session.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// multipart 업로드 — 파일명/내용으로 소스 판별해 세션 적재.
// 응답 sources는 업로드 파일 순서와 정렬 (프런트 커넥터 점등용).
app.post('/api/upload', upload.array('files'), (req, res) => {
  const files = (req.files ?? []) as Express.Multer.File[];
  if (!files.length) return res.status(400).json({ ok: false, error: 'files required' });
  const ingested: IngestResult[] = [];
  const errors: { filename: string; error: string }[] = [];
  for (const f of files) {
    const filename = Buffer.from(f.originalname, 'latin1').toString('utf8'); // 한글 파일명 복원
    try {
      ingested.push(ingestFile(filename, f.buffer));
    } catch (e) {
      errors.push({ filename, error: (e as Error).message });
    }
  }
  res.json({
    ok: errors.length === 0,
    sources: ingested.map((i) => i.source),
    uploaded: ingested,
    errors: errors.length ? errors : undefined,
    session: sessionSummary(),
  });
});

// 새 분석 세션 초기화 — 프런트가 '새 분석 시작' 시 호출 (업로드/데모 혼합 방지)
app.post('/api/session/reset', (_req, res) => {
  resetSession();
  res.json({ ok: true });
});

// 데모 데이터 로드 (명시적 액션 전용) — 세션을 비우고 데모 소스를 적재
app.post('/api/demo', (_req, res) => {
  const session = loadDemoIntoSession();
  res.json({ ok: true, session });
});

// 분석 시작. body.profile { name, lastDay } 있으면 실사용자 프로필로 세션에 설정.
// 없으면 세션에 이미 설정된 프로필(데모 로드 등)을 사용.
app.post('/api/analyze', (req, res) => {
  const p = req.body?.profile;
  if (p !== undefined) {
    // profile을 명시적으로 보냈다면 유효해야 한다. 불완전하면 조용히 넘기지 않고 400.
    // (빈/공백 이름이 통과하면 직전 데모 세션의 DEMO_PROFILE로 폴백해 실데이터가 '김하늘'로 분석되는 사고 방지)
    if (
      typeof p.name !== 'string' ||
      !p.name.trim() ||
      typeof p.lastDay !== 'string' ||
      !p.lastDay.trim()
    ) {
      return res.status(400).json({ error: '분석 대상자 프로필(name, lastDay)이 올바르지 않습니다.' });
    }
    setSessionProfile(realProfile(p.name.trim(), p.lastDay.trim(), todayISO()));
  }
  // 업로드 데이터엔 반드시 사용자 프로필이 있어야 한다 (없으면 데모 인물이 실데이터에 붙는 사고 방지)
  if (!getSessionProfile()) {
    return res.status(400).json({ error: '분석 대상자 프로필(name, lastDay)이 필요합니다.' });
  }
  const job = startAnalyze();
  res.json({ jobId: job.id });
});

app.get('/api/analyze/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json({
    status: job.status,
    stage: job.stage,
    stageDetail: job.stageDetail,
    error: job.error,
    sources: job.sources, // [{ source, status, count }] — Stage1 소스별 실시간
    timings: job.timings, // { stage2: { startedAt, tokens }, stage3a, stage3b }
    stuck: job.stuck, // 현재 스테이지 지연 여부
    stuckStage: job.stuckStage,
    inferredRole: job.pendingRole, // stage === 'confirm'일 때 확인 대기 중인 추정 직무
    result: job.status === 'done' ? job.result : undefined,
  });
});

// 직무 확인 체크포인트 응답 — 파이프라인을 stage3로 재개.
// body { inferredRole?: string } 미전달/빈값/기존값과 동일 → 그대로 확인(캐시 보존).
app.post('/api/analyze/:jobId/role', (req, res) => {
  const inferredRole = req.body?.inferredRole;
  const r = confirmRole(
    req.params.jobId,
    typeof inferredRole === 'string' ? inferredRole : undefined,
  );
  if ('error' in r) return res.status(r.status).json({ error: r.error });
  res.json({ ok: true });
});

// 답변 저장 + LLM 1회로 지도(landmine 또는 duty/ongoing 노트) 편입
app.post('/api/questions/:id/answer', async (req, res) => {
  const { answer } = req.body ?? {};
  if (typeof answer !== 'string' || !answer.trim())
    return res.status(400).json({ error: 'answer required' });
  try {
    const out = await saveAnswerAndIncorporate(req.params.id, answer.trim());
    if (!out) return res.status(404).json({ error: 'question not found' });
    res.json({ ok: true, card: out.card, workMap: out.workMap });
  } catch (e) {
    console.error('[answer] 편입 실패:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// 현재 WorkMap + 로드맵 + Q&A → 마크다운 인수인계서 다운로드
app.get('/api/export', (_req, res) => {
  const result = latestResult();
  if (!result) return res.status(404).json({ error: 'no completed analysis' });
  const md = buildHandoverMarkdown(result);
  const filename = `인수인계서_${result.workMap.person.name}.md`;
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="handover.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.send(md);
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => console.log(`server on http://localhost:${PORT}`));
