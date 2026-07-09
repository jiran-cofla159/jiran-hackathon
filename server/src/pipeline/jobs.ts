import { randomUUID } from 'node:crypto';
import { officenoteDocMeta, parseAll } from '../parsers/index.js';
import { runStage1 } from './stage1.js';
import { runStage2 } from './stage2.js';
import { runStage3a, runStage3b } from './stage3.js';
import type { Question, RoadmapItem, WorkMap } from './types.js';

export type AnalyzeResult = { workMap: WorkMap; roadmap: RoadmapItem[]; questions: Question[] };

export type Job = {
  id: string;
  status: 'running' | 'done' | 'error';
  stage: string; // 'parse' | 'stage1' | 'stage2' | 'stage3' | 'done'
  stageDetail: string;
  error?: string;
  result?: AnalyzeResult;
};

const jobs = new Map<string, Job>();

// 캐시 히트 시 전 파이프라인이 1초 내에 끝나 진행 연출이 안 보인다.
// 스테이지 전환마다 최소 체류 시간을 둬서 오버레이가 읽히게 한다. (데모 연출용, DEMO_PACE_MS=0으로 끄기)
const PACE_MS = Number(process.env.DEMO_PACE_MS ?? 1800);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function paced(job: Job, stage: string, detail: string) {
  job.stage = stage;
  job.stageDetail = detail;
  if (PACE_MS > 0) await sleep(PACE_MS);
}

async function runPipeline(job: Job) {
  try {
    await paced(job, 'parse', '연동된 5개 소스에서 데이터 수집 중…');
    const parsed = parseAll();

    job.stage = 'stage1';
    for (const p of parsed) {
      await paced(job, 'stage1', `${p.stats} 분석 중…`);
    }
    job.stageDetail = '소스별 업무 단서 추출 중…';
    const findings = await runStage1(parsed, (d) => (job.stageDetail = d));

    await paced(job, 'stage2', '5개 소스의 지식을 하나의 업무 지도로 종합 중…');
    const workMap = await runStage2(findings);

    await paced(job, 'stage3', '온보딩 로드맵 설계 중…');
    const roadmapP = runStage3a(workMap);
    await paced(job, 'stage3', '기록되지 않은 지식 탐지 중…');
    const [roadmap, questions] = await Promise.all([roadmapP, runStage3b(workMap, officenoteDocMeta())]);

    job.result = { workMap, roadmap, questions };
    job.stage = 'done';
    job.stageDetail = '분석 완료';
    job.status = 'done';
  } catch (e) {
    job.status = 'error';
    job.error = (e as Error).message;
    console.error('[pipeline] 실패:', e);
  }
}

export function startAnalyze(): Job {
  const job: Job = { id: randomUUID(), status: 'running', stage: 'parse', stageDetail: '시작 중…' };
  jobs.set(job.id, job);
  void runPipeline(job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function saveAnswer(questionId: string, answer: string): boolean {
  for (const job of jobs.values()) {
    const q = job.result?.questions.find((q) => q.id === questionId);
    if (q) {
      q.answer = answer;
      return true;
    }
  }
  return false;
}
