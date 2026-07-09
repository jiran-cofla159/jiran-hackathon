import type { AnalyzeResult } from './jobs.js';

const WEEK_LABEL: Record<number, string> = { 0: '즉시', 1: '1주차', 2: '2주차', 4: '한 달 내' };

export function buildHandoverMarkdown({ workMap: m, roadmap, questions }: AnalyzeResult): string {
  const lines: string[] = [
    `# ${m.person.name} 인수인계서`,
    '',
    `> ${m.person.team} · 퇴사일 ${m.person.lastDay} · 이음(AI 인수인계) 자동 생성`,
    ...(m.person.inferredRole ? ['', `**담당 업무 요약**: ${m.person.inferredRole}`] : []),
    '',
    '## 담당 업무',
    '',
    ...m.duties.map(
      (d) => `- **${d.title}** — ${d.cadence.detail} (중요도 ${d.importance})\n  ${d.summary}`,
    ),
    '',
    '## 진행 중인 일',
    '',
    ...m.ongoing.map(
      (o) =>
        `- **${o.title}**${o.due ? ` (~${o.due})` : ''} — ${o.status}\n  다음 액션: ${o.nextAction}\n  ⚠ ${o.urgencyReason}`,
    ),
    '',
    '## 관계자',
    '',
    ...m.people.map(
      (p) =>
        `- **${p.name}** (${p.org}${p.internal ? '' : ' · 외부'}) — ${p.roleToPerson}${p.tips ? `\n  💡 ${p.tips}` : ''}`,
    ),
    '',
    '## 주의 — 문서에 없는 히스토리',
    '',
    ...m.landmines.map(
      (l) => `- **${l.title}**\n  ${l.whatHappened}\n  🚫 ${l.doNot}`,
    ),
    '',
    '## 온보딩 로드맵 (후임자 첫 한 달)',
    '',
  ];
  for (const w of [0, 1, 2, 4]) {
    const items = roadmap.filter((r) => r.week === w);
    if (!items.length) continue;
    lines.push(`### ${WEEK_LABEL[w]}`, '');
    lines.push(
      ...items.map(
        (r) =>
          `- **${r.title}**${r.due ? ` (~${r.due})` : ''}${r.urgencyReason ? ` — ${r.urgencyReason}` : ''}\n  ${r.description}`,
      ),
      '',
    );
  }
  lines.push('## 전임자 인터뷰 — 기록되지 않았던 지식', '');
  for (const q of questions) {
    lines.push(`- **Q. ${q.question}**`, `  - A. ${q.answer ?? '(미답변)'}`);
  }
  lines.push('');
  return lines.join('\n');
}
