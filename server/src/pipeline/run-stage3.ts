import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { officenoteDocMeta } from '../parsers/index.js';
import { runStage3a, runStage3b } from './stage3.js';
import type { WorkMap } from './types.js';

const OUT = path.resolve(process.cwd(), process.cwd().endsWith('server') ? '../out' : 'out');
mkdirSync(OUT, { recursive: true });

const map: WorkMap = JSON.parse(readFileSync(path.join(OUT, 'workmap.json'), 'utf8'));
const docMeta = officenoteDocMeta();
console.log('문서 메타:', JSON.stringify(docMeta));

const [roadmap, questions] = await Promise.all([runStage3a(map), runStage3b(map, docMeta)]);
writeFileSync(path.join(OUT, 'roadmap.json'), JSON.stringify(roadmap, null, 2));
writeFileSync(path.join(OUT, 'questions.json'), JSON.stringify(questions, null, 2));

console.log(`\n== 로드맵 (${roadmap.length})`);
for (const w of [0, 1, 2, 4] as const) {
  const items = roadmap.filter((r) => r.week === w);
  if (!items.length) continue;
  console.log(`\n-- week ${w} ${w === 0 ? '(즉시)' : w === 4 ? '(한 달 내)' : `(${w}주차)`}`);
  items.forEach((r) =>
    console.log(`  [${r.urgency}] ${r.title}${r.due ? ` (due ${r.due})` : ''}${r.urgencyReason ? ` — ${r.urgencyReason}` : ''}\n      ${r.description}`),
  );
}

console.log(`\n== 역질문 (${questions.length})`);
questions.forEach((q, i) =>
  console.log(`\n${i + 1}. [${q.gapType}] ${q.question}\n   관찰: ${q.observation}\n   필요성: ${q.whyNeeded}\n   근거: ${q.evidence.map((e) => `${e.source} ${e.ref}`).join(' / ')}`),
);
console.log('\nout/roadmap.json, out/questions.json 저장 완료');
