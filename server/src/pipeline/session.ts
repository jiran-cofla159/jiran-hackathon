import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  MOCKDATA_DIR,
  buildEmail,
  buildJira,
  buildJiraFromCsv,
  buildOfficechat,
  buildOfficenote,
  buildSlack,
  docMetaFromDocs,
  isJiraCsv,
  type ParsedSource,
  type RawDoc,
} from '../parsers/index.js';
import { parseEml, parseMbox, type EmailObj } from '../parsers/mbox.js';
import { parseSlackExport } from '../parsers/slack-export.js';
import { DEMO_PROFILE, type Profile } from './profile.js';

// 업로드 세션 (인메모리, 단일 세션 — 데모 스코프)
// 파일명·내용으로 소스 타입을 판별해 적재하고, 분석 시 ParsedSource[]로 빌드한다.

type Origin = 'upload' | 'demo';

type SessionState = {
  emails?: any;
  jira?: any; // JSON export (데모 데이터)
  jiraCsv?: string; // Jira Cloud "Export Excel CSV (all fields)" 원문 — JSON과 상호 배타
  slackUsers?: any[];
  slackChannels: any[];
  officenoteDocs: RawDoc[];
  officechat?: any;
  profile?: Profile;
  origin?: Origin; // 이 세션이 업로드로 채워졌는지 데모로 채워졌는지 — 혼합 방지
  sealed: boolean; // 분석이 한 번 완료됨 → 다음 업로드는 새 분석으로 간주해 자동 초기화
};

const state: SessionState = { slackChannels: [], officenoteDocs: [], sealed: false };

export type IngestResult = {
  filename: string;
  source: 'email' | 'jira' | 'slack' | 'officenote' | 'officechat';
  detail: string;
};

// 업로드 파일 적재 전 호출 — 새 분석 배치의 첫 파일이면 이전 소스를 전부 비운다.
// (1) 직전 세션이 데모였거나 (2) 이미 분석이 끝난 세션이면 새 분석으로 간주.
function isolateForUpload() {
  if (state.origin === 'demo' || state.sealed) resetSession();
  state.origin = 'upload';
}

export function ingestFile(filename: string, buffer: Buffer): IngestResult {
  isolateForUpload();
  return ingestCore(filename, buffer);
}

const addrOf = (s: string) => s.match(/<([^>]+)>/)?.[1] ?? s.trim();

function ingestCore(filename: string, buffer: Buffer): IngestResult {
  const lower = filename.toLowerCase();

  // Slack workspace export ZIP — 바이너리이므로 utf8 변환 전에 처리
  if (lower.endsWith('.zip') || (buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    const { users, channels } = parseSlackExport(buffer);
    if (!channels.length) throw new Error(`Slack export ZIP에서 채널을 찾지 못했습니다: ${filename}`);
    state.slackUsers = users;
    state.slackChannels = channels;
    const msgCount = channels.reduce((n, c) => n + c.messages.length, 0);
    return { filename, source: 'slack', detail: `채널 ${channels.length}개 · 메시지 ${msgCount}개` };
  }

  // 이메일함 export (.mbox — Gmail Takeout 등)
  if (lower.endsWith('.mbox')) {
    const parsed = parseMbox(buffer);
    if (!parsed.emails.length) throw new Error(`메일을 찾지 못했습니다: ${filename}`);
    state.emails = parsed;
    return { filename, source: 'email', detail: `메일 ${parsed.emails.length}통` };
  }

  // 개별 이메일 (.eml) — 여러 건을 누적
  if (lower.endsWith('.eml')) {
    const em = parseEml(buffer);
    if (!em) throw new Error(`이메일을 파싱하지 못했습니다: ${filename}`);
    const box = state.emails ?? { mailbox: '', exported_at: new Date().toISOString(), emails: [] };
    box.emails.push(em);
    box.emails = box.emails.map((e: EmailObj, i: number) => ({ ...e, id: `m-${String(i + 1).padStart(3, '0')}` }));
    if (!box.mailbox) box.mailbox = addrOf(em.to[0] ?? '') || '(.eml 업로드)';
    state.emails = box;
    return { filename, source: 'email', detail: `메일 ${box.emails.length}통` };
  }

  const content = buffer.toString('utf8');

  if (filename.endsWith('.md')) {
    state.officenoteDocs = state.officenoteDocs.filter((d) => d.name !== filename);
    state.officenoteDocs.push({ name: filename, content });
    return { filename, source: 'officenote', detail: '문서 1건' };
  }

  if (filename.endsWith('.csv') || isJiraCsv(content)) {
    if (!isJiraCsv(content))
      throw new Error(`CSV는 Jira "Export Excel CSV (all fields)" 형식만 지원: ${filename}`);
    const built = buildJiraFromCsv(content); // 형식 검증 겸 즉시 빌드
    state.jiraCsv = content;
    state.jira = undefined;
    return { filename, source: 'jira', detail: built.stats };
  }

  let data: any;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error(
      `지원하지 않는 파일 형식: ${filename} (.mbox·.eml·Slack .zip·Jira .csv·.md·JSON만 가능)`,
    );
  }

  if (Array.isArray(data.emails)) {
    state.emails = data;
    return { filename, source: 'email', detail: `메일 ${data.emails.length}통` };
  }
  if (Array.isArray(data.issues)) {
    state.jira = data;
    state.jiraCsv = undefined;
    return { filename, source: 'jira', detail: `이슈 ${data.issues.length}건` };
  }
  if (Array.isArray(data.rooms)) {
    state.officechat = data;
    return { filename, source: 'officechat', detail: `대화방 ${data.rooms.length}개` };
  }
  if (data.channel && Array.isArray(data.messages)) {
    state.slackChannels = state.slackChannels.filter((c) => c.channel.name !== data.channel.name);
    state.slackChannels.push(data);
    return { filename, source: 'slack', detail: `#${data.channel.name} 메시지 ${data.messages.length}개` };
  }
  if (Array.isArray(data) && data[0]?.real_name && data[0]?.profile) {
    state.slackUsers = data;
    return { filename, source: 'slack', detail: `사용자 ${data.length}명` };
  }

  throw new Error(`소스 타입을 판별할 수 없음: ${filename}`);
}

export function hasSessionData(): boolean {
  return !!(
    state.emails ||
    state.jira ||
    state.jiraCsv ||
    state.slackChannels.length ||
    state.officenoteDocs.length ||
    state.officechat
  );
}

export function sessionSources(): ParsedSource[] {
  const out: ParsedSource[] = [];
  if (state.emails) out.push(buildEmail(state.emails));
  if (state.jiraCsv) out.push(buildJiraFromCsv(state.jiraCsv));
  else if (state.jira) out.push(buildJira(state.jira));
  if (state.slackChannels.length) out.push(buildSlack(state.slackUsers, state.slackChannels));
  if (state.officenoteDocs.length) out.push(buildOfficenote(state.officenoteDocs));
  if (state.officechat) out.push(buildOfficechat(state.officechat));
  return out;
}

export function sessionDocMeta(): { title: string; lastModified: string }[] {
  return docMetaFromDocs(state.officenoteDocs);
}

export function sessionSummary(): { source: string; detail: string }[] {
  const s: { source: string; detail: string }[] = [];
  if (state.emails) s.push({ source: 'email', detail: `메일 ${state.emails.emails.length}통` });
  if (state.jiraCsv) s.push({ source: 'jira', detail: buildJiraFromCsv(state.jiraCsv).stats });
  else if (state.jira) s.push({ source: 'jira', detail: `이슈 ${state.jira.issues.length}건` });
  if (state.slackChannels.length)
    s.push({ source: 'slack', detail: `채널 ${state.slackChannels.length}개` });
  if (state.officenoteDocs.length)
    s.push({ source: 'officenote', detail: `문서 ${state.officenoteDocs.length}건` });
  if (state.officechat) s.push({ source: 'officechat', detail: `대화방 ${state.officechat.rooms.length}개` });
  return s;
}

// ---- 프로필 (분석 대상자) ----

export function setSessionProfile(p: Profile): void {
  state.profile = p;
}

export function getSessionProfile(): Profile | undefined {
  return state.profile;
}

export function sealSession(): void {
  state.sealed = true;
}

// ---- 데모 데이터 로드 (명시적 액션 전용) ----
// 업로드와 완전히 동일한 ingest 경로를 타므로 결과가 디렉터리 로드와 바이트 단위로 일치한다.

// 데모 데이터는 flat 구조(한 디렉터리에 평면 배치). 소스 판별은 파일 내용 기반이라
// (.md만 파일명으로 officenote 처리) 파일명 규칙이 달라도 업로드 경로와 동일 결과가 나온다.
// README.md는 각본 설명 파일이라 제외. 빌더가 모두 내부 정렬하므로 ingest 순서는 캐시에 무관.
export function loadDemoIntoSession(dir = MOCKDATA_DIR): { source: string; detail: string }[] {
  resetSession();
  const all = readdirSync(dir);
  const channels = all.filter((f) => /^slack-.*\.json$/.test(f) && f !== 'slack-users.json');
  const notes = all.filter((f) => f.endsWith('.md') && f !== 'README.md');
  const files = [
    'emails.json',
    'jira-issues.json',
    'slack-users.json',
    ...channels,
    ...notes,
    'officechat-export.json',
  ];
  for (const f of files) ingestCore(f, readFileSync(path.join(dir, f)));
  state.origin = 'demo';
  state.profile = DEMO_PROFILE;
  return sessionSummary();
}

export function resetSession(): void {
  state.emails = undefined;
  state.jira = undefined;
  state.jiraCsv = undefined;
  state.slackUsers = undefined;
  state.slackChannels = [];
  state.officenoteDocs = [];
  state.officechat = undefined;
  state.profile = undefined;
  state.origin = undefined;
  state.sealed = false;
}
