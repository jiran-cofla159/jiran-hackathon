// 완료 기준 검증: 업로드 경로(session)가 데모 디렉터리 경로(parseAll)와
// 소스별로 완전히 동일한 텍스트를 만드는지 확인 — 동일하면 스테이지 캐시가 일치해
// 파이프라인 결과도 기존과 동일함이 보장된다.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { MOCKDATA_DIR, officenoteDocMeta, parseAll } from '../parsers/index.js';
import { ingestFile, resetSession, sessionDocMeta, sessionSources } from './session.js';

resetSession();
const dir = MOCKDATA_DIR;
const files = [
  'email/emails.json',
  'jira/issues.json',
  'slack/users.json',
  ...readdirSync(path.join(dir, 'slack/channels')).map((f) => `slack/channels/${f}`),
  ...readdirSync(path.join(dir, 'officenote'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `officenote/${f}`),
  'officechat/export.json',
];
// 업로드 순서 영향이 없는지 보려고 역순으로 넣는다
for (const f of files.reverse()) {
  const r = ingestFile(path.basename(f), readFileSync(path.join(dir, f)));
  console.log(`업로드: ${r.filename} → ${r.source} (${r.detail})`);
}

const fromDir = parseAll();
const fromSession = sessionSources();

let ok = true;
for (const d of fromDir) {
  const s = fromSession.find((x) => x.source === d.source);
  if (!s) {
    console.error(`❌ ${d.source}: 세션에 없음`);
    ok = false;
  } else if (s.text !== d.text) {
    console.error(`❌ ${d.source}: 텍스트 불일치`);
    const i = [...d.text].findIndex((c, idx) => c !== s.text[idx]);
    console.error(`   첫 차이 @${i}: dir="${d.text.slice(i, i + 60)}" session="${s.text.slice(i, i + 60)}"`);
    ok = false;
  } else {
    console.log(`✅ ${d.source}: 텍스트 동일 (${d.text.length}자, ${s.stats})`);
  }
}
const metaEq = JSON.stringify(officenoteDocMeta()) === JSON.stringify(sessionDocMeta());
console.log(metaEq ? '✅ officenote 문서 메타 동일' : '❌ 문서 메타 불일치');
resetSession();
if (!ok || !metaEq) process.exit(1);
console.log('\n업로드 경로 = 디렉터리 경로 (스테이지 캐시 일치 → 파이프라인 결과 동일 보장)');
