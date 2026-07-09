import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseAll } from '../parsers/index.js';
import { runStage1 } from './stage1.js';

const OUT = path.resolve(process.cwd(), process.cwd().endsWith('server') ? '../out' : 'out');
mkdirSync(OUT, { recursive: true });

const parsed = parseAll();
console.log('파싱 완료:', parsed.map((p) => p.stats).join(' / '));

const findings = await runStage1(parsed, (d) => console.log(`  → ${d}`));
writeFileSync(path.join(OUT, 'stage1.json'), JSON.stringify(findings, null, 2));

for (const f of findings) {
  console.log(
    `\n=== ${f.source}: duties ${f.duties.length} · people ${f.people.length} · ongoing ${f.ongoing.length} · landmines ${f.landmines.length} · anomalies ${f.anomalies.length}`,
  );
  f.duties.forEach((d) => console.log(`  [duty] ${d.title} (${d.cadence ?? '-'})`));
  f.people.forEach((p) => console.log(`  [people] ${p.name} @${p.org}${p.tips ? ` 💡${p.tips}` : ''}`));
  f.ongoing.forEach((o) => console.log(`  [ongoing] ${o.title} → ${o.nextAction ?? '-'} (due ${o.due ?? '-'})`));
  f.landmines.forEach((l) => console.log(`  [landmine] ${l.title}`));
  f.anomalies.forEach((a) => console.log(`  [anomaly] ${a.description} (${a.period ?? '-'})`));
}
console.log(`\nout/stage1.json 저장 완료`);
