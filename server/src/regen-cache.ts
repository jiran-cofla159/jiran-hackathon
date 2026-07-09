// 데모 캐시 재생성 (일회성) — runPipeline과 동일한 (model, system, user)로 stage1~3 호출.
// 데모 기본 흐름 = 사용자가 AI 추정 직무를 그대로 확인 → stage3에 roleOverride 미전달(roleNote('')).
// 실행: cd server && npx tsx src/regen-cache.ts
import './env.js';
import { DEMO_PROFILE } from './pipeline/profile.js';
import {
  loadDemoIntoSession,
  sessionDocMeta,
  sessionSources,
} from './pipeline/session.js';
import { runStage1 } from './pipeline/stage1.js';
import { runStage2 } from './pipeline/stage2.js';
import { runStage3a, runStage3b } from './pipeline/stage3.js';

async function main() {
  loadDemoIntoSession();
  const parsed = sessionSources();
  const docMeta = sessionDocMeta();

  const t0 = Date.now();
  const findings = await runStage1(parsed, undefined, DEMO_PROFILE);
  const workMap = await runStage2(findings, DEMO_PROFILE);
  // roleOverride 미전달 — 런타임의 "그대로 확인" 경로와 프롬프트 바이트 동일
  const [roadmap, questions] = await Promise.all([
    runStage3a(workMap, DEMO_PROFILE),
    runStage3b(workMap, docMeta, DEMO_PROFILE),
  ]);

  console.log(
    `\n[regen] 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) — inferredRole="${workMap.person.inferredRole}", duties=${workMap.duties.length}, roadmap=${roadmap.length}, questions=${questions.length}`,
  );
}

main().catch((e) => {
  console.error('[regen] 실패:', e);
  process.exit(1);
});
