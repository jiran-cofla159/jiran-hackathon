import { unzip } from './unzip.js';

// 실제 Slack workspace export ZIP 파싱 → buildSlack이 기대하는 내부 형식.
// ZIP 구조: users.json, channels.json, <채널명>/<YYYY-MM-DD>.json (일자별 메시지 배열).
// Slack ts는 epoch 초("1710234567.000200")라 ISO로 변환한다 (내부 day()가 앞 10자 사용).

type SlackUser = { id: string; name?: string; real_name?: string; profile?: any };

export type SlackExport = {
  users: { id: string; name: string; real_name: string; profile: { title: string } }[];
  channels: {
    channel: { name: string; topic: string; is_archived: boolean };
    messages: { user: string; ts: string; text: string }[];
  }[];
};

function tsToIso(ts: string): string {
  const sec = Number(String(ts).split('.')[0]);
  if (!Number.isFinite(sec)) return '';
  return new Date(sec * 1000).toISOString();
}

// <@U123> 멘션·<url|label> 링크 등 Slack 마크업을 사람이 읽을 형태로 치환
function resolveMarkup(text: string, nameById: Map<string, string>): string {
  return (text || '')
    .replace(/<@([A-Z0-9]+)(\|[^>]+)?>/g, (_m, id) => `@${nameById.get(id) ?? id}`)
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, (_m, name) => `#${name}`)
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, (_m, _url, label) => label)
    .replace(/<(https?:[^>]+)>/g, (_m, url) => url)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const basename = (p: string) => p.split('/').pop() ?? p;

export function parseSlackExport(buf: Buffer): SlackExport {
  const entries = unzip(buf);
  const json = (name: string) => {
    const e = entries.find((x) => x.name === name || basename(x.name) === name);
    return e ? JSON.parse(e.data.toString('utf8')) : undefined;
  };

  const rawUsers: SlackUser[] = json('users.json') ?? [];
  const nameById = new Map<string, string>();
  for (const u of rawUsers) {
    nameById.set(u.id, u.real_name || u.profile?.real_name || u.name || u.id);
  }
  const users = rawUsers.map((u) => ({
    id: u.id,
    name: u.name ?? '',
    real_name: u.real_name || u.profile?.real_name || u.name || u.id,
    profile: { title: u.profile?.title ?? '' },
  }));

  // 채널 메타 (topic/is_archived) — 이름으로 조회
  const channelMeta = new Map<string, any>();
  for (const c of (json('channels.json') as any[]) ?? []) channelMeta.set(c.name, c);

  // <채널명>/<파일>.json 엔트리를 채널별로 묶는다
  const byChannel = new Map<string, any[]>();
  for (const e of entries) {
    const slash = e.name.indexOf('/');
    if (slash < 0 || !e.name.endsWith('.json')) continue; // 루트의 메타 파일 제외
    const dir = e.name.slice(0, slash);
    if (basename(e.name) === 'users.json' || basename(e.name) === 'channels.json') continue;
    let arr: any[];
    try {
      arr = JSON.parse(e.data.toString('utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(arr)) continue;
    (byChannel.get(dir) ?? byChannel.set(dir, []).get(dir)!).push(...arr);
  }

  const channels = [...byChannel.entries()].map(([name, msgs]) => {
    const meta = channelMeta.get(name);
    const messages = msgs
      .filter((m) => m && m.text && m.user && (m.type ?? 'message') === 'message')
      .map((m) => ({ user: m.user, ts: tsToIso(m.ts), text: resolveMarkup(m.text, nameById) }))
      .sort((a, b) => (a.ts < b.ts ? -1 : 1));
    return {
      channel: {
        name,
        topic: meta?.topic?.value ?? meta?.purpose?.value ?? '',
        is_archived: !!meta?.is_archived,
      },
      messages,
    };
  });

  return { users, channels };
}
