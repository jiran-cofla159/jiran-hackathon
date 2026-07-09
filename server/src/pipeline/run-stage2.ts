import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runStage2 } from './stage2.js';
import type { SourceFindings } from './types.js';

const OUT = path.resolve(process.cwd(), process.cwd().endsWith('server') ? '../out' : 'out');
mkdirSync(OUT, { recursive: true });

const findings: SourceFindings[] = JSON.parse(readFileSync(path.join(OUT, 'stage1.json'), 'utf8'));
const map = await runStage2(findings);
writeFileSync(path.join(OUT, 'workmap.json'), JSON.stringify(map, null, 2));

console.log(`\n인물: ${map.person.name} · ${map.person.team} · 퇴사 ${map.person.lastDay}`);
console.log(`\n== duties (${map.duties.length})`);
map.duties.forEach((d) =>
  console.log(`  [${d.id}] ${d.title} — ${d.cadence.type}/${d.cadence.detail} · ${d.importance} · 근거 ${d.evidence.map((e) => e.source).join(',')}`),
);
console.log(`\n== people (${map.people.length})`);
map.people.forEach((p) =>
  console.log(`  [${p.id}] ${p.name} @${p.org} (${p.internal ? '내부' : '외부'}) — ${p.roleToPerson}${p.tips ? ` 💡${p.tips}` : ''}`),
);
console.log(`\n== ongoing (${map.ongoing.length})`);
map.ongoing.forEach((o) =>
  console.log(`  [${o.id}] ${o.title} · ${o.urgency} (${o.urgencyReason})\n        next: ${o.nextAction} · due ${o.due ?? '-'} · 근거 ${o.evidence.map((e) => e.source).join(',')}`),
);
console.log(`\n== landmines (${map.landmines.length})`);
map.landmines.forEach((l) => console.log(`  [${l.id}] ${l.title}\n        doNot: ${l.doNot}`));
console.log(`\n== anomalies (${map.anomalies.length})`);
map.anomalies.forEach((a) => console.log(`  - ${a.description} (${a.period ?? '-'})`));
console.log('\nout/workmap.json 저장 완료');
