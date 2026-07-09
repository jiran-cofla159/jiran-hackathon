import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 소스별 export 파일 → LLM에 넣을 정리된 텍스트. ref 표기는 Evidence.ref 규약과 일치시킨다.

export const MOCKDATA_DIR =
  process.env.MOCKDATA_DIR ??
  path.join(os.homedir(), 'Documents/officenote/hackathon2026-mockdata');

export type ParsedSource = {
  source: 'email' | 'jira' | 'slack' | 'officenote' | 'officechat';
  text: string;
  stats: string; // 진행 연출용 ("메일 14통")
};

const day = (iso: string) => iso.slice(0, 10);

function parseEmail(dir: string): ParsedSource {
  const data = JSON.parse(readFileSync(path.join(dir, 'email/emails.json'), 'utf8'));
  const blocks = data.emails.map(
    (m: any) =>
      `[email ${m.id}] ${day(m.date)}\nFrom: ${m.from}\nTo: ${m.to.join(', ')}${m.cc ? `\nCC: ${m.cc.join(', ')}` : ''}\n제목: ${m.subject}\n본문: ${m.body}`,
  );
  return {
    source: 'email',
    text: `메일함: ${data.mailbox} (export ${day(data.exported_at)})\n\n${blocks.join('\n\n')}`,
    stats: `메일 ${data.emails.length}통`,
  };
}

function parseJira(dir: string): ParsedSource {
  const data = JSON.parse(readFileSync(path.join(dir, 'jira/issues.json'), 'utf8'));
  const blocks = data.issues.map((i: any) => {
    const head = `[jira ${i.key}] ${i.type} · ${i.status}${i.resolution ? ` (${i.resolution})` : ''} · 담당 ${i.assignee}\n제목: ${i.summary}\n생성 ${day(i.created)}${i.resolved ? ` · 종료 ${day(i.resolved)}` : ''}\n설명: ${i.description}`;
    const comments = (i.comments ?? []).map(
      (c: any, idx: number) => `[jira ${i.key}#c${idx + 1}] ${c.author} (${day(c.created)}): ${c.body}`,
    );
    return [head, ...comments].join('\n');
  });
  return {
    source: 'jira',
    text: `Jira 프로젝트 ${data.project} (export ${day(data.exported_at)})\n\n${blocks.join('\n\n')}`,
    stats: `Jira 이슈 ${data.issues.length}건`,
  };
}

function parseSlack(dir: string): ParsedSource {
  const users: any[] = JSON.parse(readFileSync(path.join(dir, 'slack/users.json'), 'utf8'));
  const nameOf = new Map(users.map((u) => [u.id, `${u.real_name}(${u.profile.title})`]));
  const chDir = path.join(dir, 'slack/channels');
  let msgCount = 0;
  const blocks = readdirSync(chDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const ch = JSON.parse(readFileSync(path.join(chDir, f), 'utf8'));
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
  };
}

function parseOfficenote(dir: string): ParsedSource {
  const noteDir = path.join(dir, 'officenote');
  const files = readdirSync(noteDir).filter((f) => f.endsWith('.md'));
  const blocks = files.map((f) => {
    const title = f.replace(/\.md$/, '');
    return `[officenote ${title}]\n${readFileSync(path.join(noteDir, f), 'utf8').trim()}`;
  });
  return {
    source: 'officenote',
    text: blocks.join('\n\n---\n\n'),
    stats: `오피스노트 문서 ${files.length}건`,
  };
}

// stage3b stale_doc 판정용 — 문서 제목·최종수정일 메타
export function officenoteDocMeta(dir = MOCKDATA_DIR): { title: string; lastModified: string }[] {
  const noteDir = path.join(dir, 'officenote');
  return readdirSync(noteDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const body = readFileSync(path.join(noteDir, f), 'utf8');
      const m = body.match(/최종 수정:\s*([\d-]+)/);
      return { title: f.replace(/\.md$/, ''), lastModified: m?.[1] ?? '알 수 없음' };
    });
}

function parseOfficechat(dir: string): ParsedSource {
  const data = JSON.parse(readFileSync(path.join(dir, 'officechat/export.json'), 'utf8'));
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
  };
}

export function parseAll(dir = MOCKDATA_DIR): ParsedSource[] {
  return [parseEmail(dir), parseJira(dir), parseSlack(dir), parseOfficenote(dir), parseOfficechat(dir)];
}
