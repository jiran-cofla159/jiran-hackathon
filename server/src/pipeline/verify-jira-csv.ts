// Jira CSV 경로 검증: 목데이터 issues.json을 실제 "Export Excel CSV (all fields)" 형식으로
// 변환(Jira식 날짜, 따옴표 필드, 복수 Comment 컬럼)한 뒤, JSON 경로와 동일한 텍스트가 나오는지 비교.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MOCKDATA_DIR, buildJira, buildJiraFromCsv } from '../parsers/index.js';
import { ingestFile, resetSession, sessionSources } from './session.js';

const data = JSON.parse(readFileSync(path.join(MOCKDATA_DIR, 'jira-issues.json'), 'utf8'));

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function jiraDate(iso: string): string {
  // "2025-09-08T10:30:00+09:00" → "08/Sep/25 10:30 AM"
  const [d, t] = iso.split('T');
  const [y, m, day] = d.split('-').map(Number);
  let [hh, mm] = t.split(':').map(Number);
  const ap = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${String(day).padStart(2, '0')}/${MON[m - 1]}/${String(y).slice(2)} ${hh}:${String(mm).padStart(2, '0')} ${ap}`;
}
const q = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;

const maxComments = Math.max(...data.issues.map((i: any) => (i.comments ?? []).length));
const header = [
  'Summary', 'Issue key', 'Issue id', 'Issue Type', 'Status', 'Resolution',
  'Assignee', 'Created', 'Resolved', 'Description',
  ...Array(maxComments).fill('Comment'),
];
const rows = data.issues.map((i: any, n: number) => {
  const comments = (i.comments ?? []).map(
    (c: any) => `${jiraDate(c.created)};${c.author};${c.body}`,
  );
  while (comments.length < maxComments) comments.push('');
  return [
    i.summary, i.key, String(10000 + n), i.type, i.status, i.resolution ?? '',
    i.assignee, jiraDate(i.created), i.resolved ? jiraDate(i.resolved) : '', i.description,
    ...comments,
  ].map(q).join(',');
});
const csv = [header.map(q).join(','), ...rows].join('\r\n');

// 1) 빌더 직접 비교 — JSON 경로 텍스트에서 export 헤더만 제거하면 동일해야 함
const fromJson = buildJira(data).text.replace(/^Jira 프로젝트 (\S+) \(export [\d-]+\)/, 'Jira 프로젝트 $1');
const fromCsv = buildJiraFromCsv(csv).text;
if (fromJson !== fromCsv) {
  const i = [...fromJson].findIndex((c, idx) => c !== fromCsv[idx]);
  console.error(`❌ 텍스트 불일치 @${i}\n  json="${fromJson.slice(i, i + 80)}"\n  csv ="${fromCsv.slice(i, i + 80)}"`);
  process.exit(1);
}
console.log(`✅ CSV 경로 텍스트 = JSON 경로 텍스트 (${fromCsv.length}자, 이슈 ${data.issues.length}건, Comment 컬럼 ${maxComments}개)`);

// 2) 세션 ingest 경로 (.csv 업로드)
resetSession();
const r = ingestFile('JIRA (PLT) 2026-07-09.csv', Buffer.from(csv));
console.log(`✅ ingest: ${r.filename} → ${r.source} (${r.detail})`);
const s = sessionSources().find((x) => x.source === 'jira');
if (s?.text !== fromCsv) {
  console.error('❌ 세션 빌드 결과가 다름');
  process.exit(1);
}
console.log('✅ 세션(.csv 업로드) 빌드 동일');

// 3) 댓글 시간순 재정렬 확인 — 댓글 컬럼을 역순으로 넣어도 시간순 출력
const rev = data.issues.map((i: any, n: number) => {
  const comments = (i.comments ?? []).map((c: any) => `${jiraDate(c.created)};${c.author};${c.body}`).reverse();
  while (comments.length < maxComments) comments.push('');
  return [
    i.summary, i.key, String(10000 + n), i.type, i.status, i.resolution ?? '',
    i.assignee, jiraDate(i.created), i.resolved ? jiraDate(i.resolved) : '', i.description,
    ...comments,
  ].map(q).join(',');
});
const csvRev = [header.map(q).join(','), ...rev].join('\r\n');
if (buildJiraFromCsv(csvRev).text !== fromCsv) {
  console.error('❌ 댓글 역순 입력 시 정렬 실패');
  process.exit(1);
}
console.log('✅ 댓글 컬럼 역순 입력도 시간순 정렬');
resetSession();
