import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 소스별 export 데이터 → LLM에 넣을 정리된 텍스트. ref 표기는 Evidence.ref 규약과 일치시킨다.
// 데모 디렉터리 일괄 로드(parseAll)와 업로드 세션(session.ts) 양쪽에서 같은 빌더를 쓴다
// — 같은 파일이면 어느 경로로 들어와도 텍스트가 동일해야 스테이지 캐시가 일치한다.

export const MOCKDATA_DIR =
  process.env.MOCKDATA_DIR ??
  path.join(os.homedir(), 'Documents/officenote/hackathon2026-mockdata');

export type ParsedSource = {
  source: 'email' | 'jira' | 'slack' | 'officenote' | 'officechat';
  text: string;
  stats: string; // 진행 연출용 ("메일 14통")
  count: number; // 항목 수 (메일 통수·이슈 건수 등) — 진행 표시 카운트용
};

export type RawDoc = { name: string; content: string };

const day = (iso: string) => iso.slice(0, 10);

export function buildEmail(data: any): ParsedSource {
  const blocks = data.emails.map(
    (m: any) =>
      `[email ${m.id}] ${day(m.date)}\nFrom: ${m.from}\nTo: ${m.to.join(', ')}${m.cc ? `\nCC: ${m.cc.join(', ')}` : ''}\n제목: ${m.subject}\n본문: ${m.body}`,
  );
  return {
    source: 'email',
    text: `메일함: ${data.mailbox} (export ${day(data.exported_at)})\n\n${blocks.join('\n\n')}`,
    stats: `메일 ${data.emails.length}통`,
    count: data.emails.length,
  };
}

export function buildJira(data: any): ParsedSource {
  const blocks = data.issues.map((i: any) => {
    const head = `[jira ${i.key}] ${i.type} · ${i.status}${i.resolution ? ` (${i.resolution})` : ''} · 담당 ${i.assignee}\n제목: ${i.summary}\n생성 ${day(i.created)}${i.resolved ? ` · 종료 ${day(i.resolved)}` : ''}\n설명: ${i.description}`;
    const comments = (i.comments ?? []).map(
      (c: any, idx: number) => `[jira ${i.key}#c${idx + 1}] ${c.author} (${day(c.created)}): ${c.body}`,
    );
    return [head, ...comments].join('\n');
  });
  const exported = data.exported_at ? ` (export ${day(data.exported_at)})` : '';
  return {
    source: 'jira',
    text: `Jira 프로젝트 ${data.project}${exported}\n\n${blocks.join('\n\n')}`,
    stats: `Jira 이슈 ${data.issues.length}건`,
    count: data.issues.length,
  };
}

// ---- Jira CSV ("Export Excel CSV (all fields)") ----
// 실사용자 업로드 기준: Jira Cloud UI에는 JSON export가 없어 CSV로 들어온다.
// CSV를 JSON export와 같은 내부 이슈 형태로 변환한 뒤 buildJira를 재사용한다 (출력 텍스트 규약 동일).

// RFC 4180: 따옴표 필드(내부 콤마·개행·"" 이스케이프) 지원
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, ''); // BOM 제거
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

// Jira CSV 날짜("09/Jul/26 10:30 AM" 등) → "YYYY-MM-DD". ISO는 그대로 앞 10자.
const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};
function jiraDay(s: string): string {
  if (!s) return '';
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const m = s.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${MONTHS[m[2].toLowerCase()] ?? '01'}-${m[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

// 정렬용 분 단위 키 — 같은 날 여러 댓글의 순서 보존에 필요
function jiraInstant(s: string): string {
  const t = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  let time = '00:00';
  if (t) {
    let hh = Number(t[1]);
    const ap = t[3]?.toUpperCase();
    if (ap === 'PM' && hh < 12) hh += 12;
    if (ap === 'AM' && hh === 12) hh = 0;
    time = `${String(hh).padStart(2, '0')}:${t[2]}`;
  }
  return `${jiraDay(s)} ${time}`;
}

export function isJiraCsv(content: string): boolean {
  const firstLine = content.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  return /(^|,)"?issue key"?(,|$)/i.test(firstLine);
}

export function buildJiraFromCsv(content: string): ParsedSource {
  const rows = parseCsv(content);
  if (rows.length < 2) throw new Error('Jira CSV: 데이터 행이 없음');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    key: col('issue key'),
    summary: col('summary'),
    type: col('issue type'),
    status: col('status'),
    resolution: col('resolution'),
    assignee: col('assignee'),
    created: col('created'),
    resolved: col('resolved'),
    description: col('description'),
  };
  if (idx.key < 0) throw new Error('Jira CSV: "Issue Key" 컬럼 없음');
  // "Comment" 컬럼은 복수 — 시간순으로 들어오지만 안전하게 타임스탬프로 재정렬
  const commentCols = header
    .map((h, i) => (h === 'comment' ? i : -1))
    .filter((i) => i >= 0);
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');

  const issues = rows.slice(1).map((r) => {
    const comments = commentCols
      .map((i) => cell(r, i))
      .filter(Boolean)
      .map((raw) => {
        // Jira CSV 댓글 형식: "타임스탬프;작성자;본문" (본문에 ;가 있을 수 있어 앞 2개만 분리)
        const [ts, author, ...body] = raw.split(';');
        return body.length
          ? { created: ts.trim(), author: author.trim(), body: body.join(';').trim() }
          : { created: '', author: '', body: raw }; // 형식이 다르면 본문 통째로 보존
      })
      .sort((a, b) => jiraInstant(a.created).localeCompare(jiraInstant(b.created)));
    return {
      key: cell(r, idx.key),
      summary: cell(r, idx.summary),
      type: cell(r, idx.type) || 'Task',
      status: cell(r, idx.status),
      resolution: cell(r, idx.resolution) || undefined,
      assignee: cell(r, idx.assignee),
      created: jiraDay(cell(r, idx.created)),
      resolved: cell(r, idx.resolved) ? jiraDay(cell(r, idx.resolved)) : undefined,
      description: cell(r, idx.description),
      comments: comments.map((c) => ({ ...c, created: jiraDay(c.created) })),
    };
  });
  const project = issues[0]?.key?.split('-')[0] ?? 'JIRA';
  return buildJira({ project, exported_at: '', issues });
}

export function buildSlack(users: any[] | undefined, channels: any[]): ParsedSource {
  const nameOf = new Map((users ?? []).map((u) => [u.id, `${u.real_name}(${u.profile.title})`]));
  let msgCount = 0;
  const blocks = [...channels]
    .sort((a, b) => (a.channel.name < b.channel.name ? -1 : 1))
    .map((ch) => {
      msgCount += ch.messages.length;
      const lines = ch.messages.map(
        (m: any) =>
          `[slack ${ch.channel.name}@${day(m.ts)}] ${nameOf.get(m.user) ?? m.user}: ${m.text}`,
      );
      return `# 채널 #${ch.channel.name} — ${ch.channel.topic}${ch.channel.is_archived ? ` (아카이브됨 ${day(ch.channel.archived_at ?? '')})` : ''}\n${lines.join('\n')}`;
    });
  return {
    source: 'slack',
    text: blocks.join('\n\n'),
    stats: `Slack ${blocks.length}개 채널 · ${msgCount}개 메시지`,
    count: msgCount,
  };
}

export function buildOfficenote(docs: RawDoc[]): ParsedSource {
  const blocks = [...docs]
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((d) => {
      const title = d.name.replace(/\.md$/, '');
      return `[officenote ${title}]\n${d.content.trim()}`;
    });
  return {
    source: 'officenote',
    text: blocks.join('\n\n---\n\n'),
    stats: `오피스노트 문서 ${docs.length}건`,
    count: docs.length,
  };
}

// stage3b stale_doc 판정용 — 문서 제목·최종수정일 메타
export function docMetaFromDocs(docs: RawDoc[]): { title: string; lastModified: string }[] {
  return [...docs]
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((d) => {
      const m = d.content.match(/최종 수정:\s*([\d-]+)/);
      return { title: d.name.replace(/\.md$/, ''), lastModified: m?.[1] ?? '알 수 없음' };
    });
}

export function buildOfficechat(data: any): ParsedSource {
  let msgCount = 0;
  const blocks = data.rooms.map((r: any) => {
    msgCount += r.messages.length;
    const lines = r.messages.map(
      (m: any) => `[officechat ${r.room_id}@${day(m.sent_at)}] ${m.sender}: ${m.text}`,
    );
    return `# ${r.type === 'dm' ? 'DM' : '그룹 룸'} "${r.name}" (멤버: ${r.members.join(', ')})\n${lines.join('\n')}`;
  });
  return {
    source: 'officechat',
    text: `OfficeChat export — 사용자 ${data.user} (${day(data.exported_at)})\n\n${blocks.join('\n\n')}`,
    stats: `오피스챗 ${data.rooms.length}개 대화방 · ${msgCount}개 메시지`,
    count: msgCount,
  };
}

// ---- 데모 데이터 디렉터리 일괄 로드 (영상 백업용 경로 — 유지) ----

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

function readOfficenoteDocs(dir: string): RawDoc[] {
  const noteDir = path.join(dir, 'officenote');
  return readdirSync(noteDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ name: f, content: readFileSync(path.join(noteDir, f), 'utf8') }));
}

export function officenoteDocMeta(dir = MOCKDATA_DIR): { title: string; lastModified: string }[] {
  return docMetaFromDocs(readOfficenoteDocs(dir));
}

export function parseAll(dir = MOCKDATA_DIR): ParsedSource[] {
  const chDir = path.join(dir, 'slack/channels');
  const channels = readdirSync(chDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(chDir, f)));
  return [
    buildEmail(readJson(path.join(dir, 'email/emails.json'))),
    buildJira(readJson(path.join(dir, 'jira/issues.json'))),
    buildSlack(readJson(path.join(dir, 'slack/users.json')), channels),
    buildOfficenote(readOfficenoteDocs(dir)),
    buildOfficechat(readJson(path.join(dir, 'officechat/export.json'))),
  ];
}
