import { useEffect, useRef, useState } from 'react';
import { Badge, Card } from '../ui';
import type { JobStatus } from '../api';
import { dDay, type Profile, type SourceSummary } from '../App';

export type ConnectorKey = 'slack' | 'email' | 'jira' | 'officenote';

// guide: 각 서비스의 실제 내보내기 메뉴 경로 기준.
// headline: 시작 전 알아야 할 전제(예: 관리자 요청) / caution: ※ 주의 / help: 공식 도움말
type ExportGuide = { headline?: string; steps: string[]; caution: string; help?: string };

export const CONNECTORS: {
  key: ConnectorKey;
  icon: string;
  name: string;
  desc: string;
  match: RegExp;
  guide: ExportGuide;
  // 본인이 직접 내보낼 수 없고 관리자를 거쳐야 하는 소스 (개인 가능 소스와 시각 구분)
  adminRequired?: boolean;
}[] = [
  {
    key: 'slack',
    icon: '💬',
    name: 'Slack',
    desc: '채널 · DM 내보내기',
    match: /slack/i,
    adminRequired: true,
    guide: {
      headline:
        '이 데이터는 워크스페이스 관리자만 내보낼 수 있습니다. 아래 경로를 관리자에게 전달해 ZIP 파일을 받은 뒤, 본인이 직접 업로드하세요.',
      steps: [
        '사이드바 "관리자" → "워크스페이스 설정" → "보안" → "데이터 가져오기 및 내보내기" (구버전 UI: 워크스페이스 이름 클릭 → "도구 및 설정" → "워크스페이스 설정")',
        '"내보내기" 탭 → 날짜 범위 선택 → "내보내기 시작"',
        '완료 이메일이 오면 ZIP 다운로드 → 여기에 업로드',
      ],
      caution: '워크스페이스 소유자/관리자만 가능. 무료·프로 플랜은 공개 채널만 내보내집니다.',
      help: 'https://slack.com/intl/ko-kr/help/articles/201658943',
    },
  },
  {
    key: 'email',
    icon: '✉️',
    name: '이메일',
    desc: '메일함 내보내기 (.mbox)',
    match: /mail|\.eml$|\.mbox$/i,
    guide: {
      steps: [
        'Gmail: takeout.google.com 접속 → "메일"만 선택',
        '내보내기 생성 → 완료 메일에서 .mbox 다운로드',
        'Outlook: 파일 → 열기 및 내보내기 → 가져오기/내보내기 → 파일로 내보내기',
        '받은 백업 파일을 여기에 업로드',
      ],
      caution: '버전·플랜에 따라 메뉴 위치가 다를 수 있습니다.',
    },
  },
  {
    key: 'jira',
    icon: '🎫',
    name: 'Jira',
    desc: '이슈 · 댓글 내보내기',
    match: /jira/i,
    guide: {
      steps: [
        '상단 "필터" → "업무 항목 검색"에서 본인 담당 항목 검색 (예: assignee = 본인)',
        '우측 상단 "•••" → "내보내기" → "Export Excel CSV (all fields)"',
        '받은 CSV를 여기에 업로드',
      ],
      caution: '꼭 "(all fields)"를 선택하세요 — 댓글은 이 옵션에만 포함됩니다. 1회 최대 10,000건.',
      help: 'https://support.atlassian.com/jira/kb/how-to-export-issues-f',
    },
  },
  {
    key: 'officenote',
    icon: '📝',
    name: '오피스노트',
    desc: '문서 · 주간보고',
    match: /note|보고|report|doc/i,
    guide: {
      steps: [
        '내 문서에서 내보낼 문서 열기',
        '더보기(⋯) 메뉴 → 내보내기 → Markdown(.md)',
        '주간보고·체크리스트 등 문서별로 반복',
        '받은 .md 파일들을 여기에 업로드',
      ],
      caution: '버전·플랜에 따라 메뉴 위치가 다를 수 있습니다.',
    },
  },
];

const PLANNED = [
  { icon: '🔗', name: 'OAuth 실시간 연동', desc: '계정 연결로 자동 수집' },
  { icon: '🐙', name: 'GitHub', desc: 'PR · 이슈 · 리뷰' },
  { icon: '💭', name: '오피스챗', desc: '팀 룸 · DM', adminRequired: true },
];

// 파일명으로 커넥터 추론 — 서버 /api/upload가 sources를 안 내려줄 때의 폴백이기도 함
export function inferSource(filename: string): ConnectorKey {
  return CONNECTORS.find((c) => c.match.test(filename))?.key ?? 'officenote';
}

// hint: 오래 걸리는 단계의 기대치 안내 / stuckSec: 이 시간을 넘기면 클라이언트가 지연으로 백업 판정
const STAGES: { key: string; label: string; hint?: string; stuckSec: number }[] = [
  { key: 'parse', label: '연동 소스 데이터 수집', stuckSec: 60 },
  { key: 'stage1', label: '소스별 업무 단서 추출', stuckSec: 120 },
  {
    key: 'stage2',
    label: '지식 종합 — 업무 지도 구성',
    hint: '지식을 종합하고 있어요 — 이 단계가 가장 깁니다 (보통 2~4분)',
    stuckSec: 360,
  },
  {
    key: 'stage3',
    label: '온보딩 로드맵 설계 · 기록되지 않은 지식 탐지',
    hint: '온보딩 로드맵을 설계하고 있어요 (보통 1~2분)',
    stuckSec: 240,
  },
];

// stage1 하위 항목: 소스 표시명 + stageDetail 매칭 키워드 (진행 중 소스 판별용)
const SOURCE_META: Record<string, { label: string; icon: string; kw: RegExp }> = {
  email: { label: '이메일', icon: '✉️', kw: /메일/ },
  jira: { label: 'Jira', icon: '🎫', kw: /jira|이슈/i },
  slack: { label: 'Slack', icon: '💬', kw: /slack|채널/i },
  officenote: { label: '오피스노트', icon: '📝', kw: /오피스노트|문서/ },
  officechat: { label: '오피스챗', icon: '💭', kw: /오피스챗|대화방/ },
};

const fmtElapsed = (sec: number) =>
  sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분 ${String(sec % 60).padStart(2, '0')}초`;

// 문구는 실제 동작 범위만 서술: stage1 프롬프트의 "업무 무관 내용 무시" 원칙,
// 업로드 파일만 분석, 공유 버튼 전까지 후임자 비공개.
const PRIVACY_POINTS = [
  '업로드한 데이터는 업무 지도 생성에만 사용됩니다.',
  '업무와 무관한 사적 대화는 분석 단계에서 제외됩니다.',
  '지도는 본인이 공유하기 전까지 후임자에게 보이지 않습니다.',
];

export function ConnectScreen({
  profile,
  connected,
  onFiles,
  job,
  onStart,
  onRetry,
  sources,
  analyzeStartedAt,
  consented,
  onConsent,
  purged,
}: {
  profile: Profile;
  connected: Partial<Record<ConnectorKey, string[]>>;
  onFiles: (files: File[]) => void;
  job: JobStatus | null;
  onStart: () => void;
  onRetry: () => void;
  sources: SourceSummary[];
  analyzeStartedAt: number | null;
  consented: boolean;
  onConsent: (v: boolean) => void;
  purged: boolean;
}) {
  const running = job?.status === 'running';
  const connectedCount = Object.keys(connected).length;
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (list: FileList | null) => {
    if (list?.length) onFiles(Array.from(list));
  };

  return (
    <div className="relative space-y-6">
      <Card className="flex items-center justify-between !p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-700">
            {profile.name.slice(0, 1)}
          </span>
          <div>
            <div className="text-lg font-semibold">{profile.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="red">퇴사 D-{dDay(profile.lastDay)} · {profile.lastDay}</Badge>
          <button
            onClick={onStart}
            disabled={running || connectedCount === 0 || !consented}
            className="cursor-pointer rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running
              ? '분석 중…'
              : connectedCount === 0
                ? '데이터를 먼저 연동하세요'
                : !consented
                  ? '동의 후 분석할 수 있습니다'
                  : '분석 시작'}
          </button>
        </div>
      </Card>

      {purged && (
        <Card className="flex items-center gap-3 border-emerald-200 bg-emerald-50/60 !py-3.5">
          <span className="text-lg">🗑️</span>
          <div className="text-sm font-semibold text-emerald-800">원문은 분석 후 삭제되었습니다.</div>
        </Card>
      )}

      <Card className="border-indigo-100 bg-indigo-50/40 !p-5">
        <div className="flex items-center gap-2 text-base font-semibold">
          <span>🔐</span> 이 분석은 본인 동의로만 시작됩니다
        </div>
        <ul className="mt-3 space-y-1.5">
          {PRIVACY_POINTS.map((p) => (
            <li key={p} className="flex gap-2 text-sm text-neutral-600">
              <span className="text-indigo-400">·</span>
              {p}
            </li>
          ))}
        </ul>
        <label className="mt-4 flex cursor-pointer items-center gap-2.5 border-t border-indigo-100 pt-4 text-sm font-medium">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => onConsent(e.target.checked)}
            disabled={running}
            className="h-4 w-4 accent-indigo-600"
          />
          내 활동 데이터 분석에 동의합니다
        </label>
      </Card>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-12 transition ${
          dragging
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-neutral-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="text-4xl">📂</div>
        <div className="mt-3 text-base font-semibold">
          내보내기 파일을 여기에 끌어다 놓으세요
        </div>
        <div className="mt-1 text-sm text-neutral-500">Slack · 이메일 · Jira · 오피스노트</div>
        <div className="mt-3 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-500">
          또는 클릭해서 파일 선택
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-neutral-500">
          연동 소스 <span className="font-normal text-neutral-400">— {connectedCount}/{CONNECTORS.length} 연동됨</span>
        </h2>
        <div className="grid grid-cols-4 items-start gap-3">
          {CONNECTORS.map((c) => {
            const files = connected[c.key];
            const on = c.key in connected;
            return (
              <Card
                key={c.key}
                className={`!p-4 transition ${
                  on
                    ? 'border-emerald-300 ring-1 ring-emerald-200'
                    : c.adminRequired
                      ? 'border-amber-200 bg-amber-50/40'
                      : 'border-neutral-200'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-2xl">{c.icon}</span>
                  <span className="flex gap-1.5">
                    {c.adminRequired && <Badge tone="amber">👤 관리자 협조 필요</Badge>}
                    {on ? <Badge tone="green">✓ 연동됨</Badge> : <Badge>대기</Badge>}
                  </span>
                </div>
                <div className={`font-semibold ${on ? '' : 'text-neutral-500'}`}>{c.name}</div>
                <div className="truncate text-xs text-neutral-500">
                  {on ? (purged ? '🗑️ 원문 삭제됨 · 인용만 보존' : files?.join(', ')) : c.desc}
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer list-none text-xs font-medium text-indigo-500 hover:text-indigo-700">
                    내보내는 방법 ▾
                  </summary>
                  {c.guide.headline && (
                    <p className="mt-1.5 text-xs font-semibold text-amber-700">👤 {c.guide.headline}</p>
                  )}
                  <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-neutral-600">
                    {c.guide.steps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ol>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-400">※ {c.guide.caution}</p>
                  {c.guide.help && (
                    <a
                      href={c.guide.help}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 inline-block text-[11px] text-indigo-500 underline hover:text-indigo-700"
                    >
                      공식 도움말 ↗
                    </a>
                  )}
                </details>
              </Card>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-3">
          {PLANNED.map((c) => (
            <Card key={c.name} className="!p-4 opacity-45">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl grayscale">{c.icon}</span>
                <span className="flex gap-1.5">
                  {c.adminRequired && <Badge tone="amber">👤 관리자 협조 필요</Badge>}
                  <Badge>지원 예정</Badge>
                </span>
              </div>
              <div className="font-semibold text-neutral-500">{c.name}</div>
              <div className="text-xs text-neutral-400">{c.desc}</div>
            </Card>
          ))}
        </div>
      </div>

      {running && (
        <AnalysisOverlay
          name={profile.name}
          job={job}
          sources={sources}
          startedAt={analyzeStartedAt}
          onRetry={onRetry}
        />
      )}

      {job?.status === 'error' && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">분석 실패: {job.error}</Card>
      )}
    </div>
  );
}

function Spinner({ className = 'border-white/40 border-t-white' }: { className?: string }) {
  return <span className={`h-3 w-3 animate-spin rounded-full border-2 ${className}`} />;
}

function AnalysisOverlay({
  name,
  job,
  sources,
  startedAt,
  onRetry,
}: {
  name: string;
  job: JobStatus | null;
  sources: SourceSummary[];
  startedAt: number | null;
  onRetry: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const stageStartRef = useRef(now);
  const lastStageRef = useRef(job?.stage);
  // stageDetail로 진행 중인 소스를 단조 추적 (병렬 처리라 뒤로 가지 않도록 max 유지)
  const seenIdxRef = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 스테이지가 바뀌면 스테이지 경과 타이머 리셋
  if (job?.stage !== lastStageRef.current) {
    lastStageRef.current = job?.stage;
    stageStartRef.current = Date.now();
    seenIdxRef.current = 0;
  }

  const stageIdx = STAGES.findIndex((s) => s.key === job?.stage);
  const totalSec = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const stageSec = Math.max(0, Math.floor((now - stageStartRef.current) / 1000));

  const current = STAGES[stageIdx];
  const stuck = !!job?.stuck || (!!current && stageSec >= current.stuckSec);

  // stage1 하위 항목: 업로드 세션 요약 순서 유지, 없으면 표시 안 함
  const subItems = sources;
  // 현재 stageDetail이 가리키는 소스 인덱스(단조 증가)
  if (stageIdx === 1 && job?.stageDetail && subItems.length) {
    const hit = subItems.findIndex((s) => SOURCE_META[s.source]?.kw.test(job.stageDetail));
    if (hit > seenIdxRef.current) seenIdxRef.current = hit;
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm">
      <Card className="w-[520px] !p-8">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{name} 님의 업무 지식을 분석하고 있습니다</h3>
          <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-xs font-medium text-neutral-600 tabular-nums">
            ⏱ {fmtElapsed(totalSec)}
          </span>
        </div>

        {stuck && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
            <span className="text-sm text-amber-800">
              ⚠ 지연되고 있습니다. 잠시 기다리거나 다시 시도할 수 있어요.
            </span>
            <button
              onClick={onRetry}
              className="shrink-0 cursor-pointer rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700"
            >
              다시 시도
            </button>
          </div>
        )}

        <ul className="space-y-4">
          {STAGES.map((s, i) => {
            const state = i < stageIdx ? 'done' : i === stageIdx ? 'running' : 'wait';
            return (
              <li key={s.key} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    state === 'done'
                      ? 'bg-emerald-100 text-emerald-700'
                      : state === 'running'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-neutral-100 text-neutral-400'
                  }`}
                >
                  {state === 'done' ? '✓' : state === 'running' ? <Spinner /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-medium ${state === 'wait' ? 'text-neutral-400' : 'text-neutral-900'}`}
                    >
                      {s.label}
                    </span>
                    {state === 'running' && (
                      <span className="shrink-0 font-mono text-xs text-indigo-500 tabular-nums">
                        {fmtElapsed(stageSec)}
                      </span>
                    )}
                  </div>

                  {/* stage2·3 기대치 문구 */}
                  {state === 'running' && s.hint && (
                    <div className="mt-0.5 text-xs text-neutral-500">{s.hint}</div>
                  )}

                  {/* stage1: 소스 5개 하위 항목 카운트 */}
                  {s.key === 'stage1' && subItems.length > 0 && state !== 'wait' && (
                    <ul className="mt-2 space-y-1.5 border-l border-neutral-200 pl-3">
                      {subItems.map((sub, si) => {
                        const meta = SOURCE_META[sub.source] ?? { label: sub.source, icon: '📄' };
                        const subDone = state === 'done' || si < seenIdxRef.current;
                        const subRunning = state === 'running' && si === seenIdxRef.current;
                        return (
                          <li key={sub.source} className="flex items-center gap-2 text-xs">
                            <span className="w-3 shrink-0 text-center">
                              {subDone ? (
                                <span className="text-emerald-600">✓</span>
                              ) : subRunning ? (
                                <Spinner className="border-indigo-200 border-t-indigo-500" />
                              ) : (
                                <span className="text-neutral-300">·</span>
                              )}
                            </span>
                            <span className={subDone || subRunning ? 'text-neutral-700' : 'text-neutral-400'}>
                              {meta.icon} {sub.detail || meta.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* 하위 항목이 없을 때만 원본 stageDetail 노출 (중복 방지) */}
                  {state === 'running' && !(s.key === 'stage1' && subItems.length > 0) && !s.hint && job?.stageDetail && (
                    <div className="mt-0.5 text-xs text-indigo-600">{job.stageDetail}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
