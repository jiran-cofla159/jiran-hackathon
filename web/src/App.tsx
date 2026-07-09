import { useEffect, useRef, useState } from 'react';
import {
  exportHandover,
  patchProfile,
  pollJob,
  resetSession,
  startAnalyze,
  toInterviewCards,
  uploadFiles,
  type AnalyzeResult,
  type JobStatus,
} from './api';
import { CONNECTORS, ConnectScreen, inferSource, type ConnectorKey } from './screens/Connect';
import { PredecessorHome, SuccessorHome } from './screens/Home';
import { InterviewScreen } from './screens/InterviewScreen';
import { LoginScreen } from './screens/Login';
import { RoadmapScreen } from './screens/RoadmapScreen';
import { WorkMapScreen } from './screens/WorkMapScreen';

export type Role = 'predecessor' | 'successor';
export type Profile = { name: string; lastDay: string };
type Screen = 'home' | 'connect' | 'map' | 'interview' | 'roadmap';

export function dDay(lastDay: string): number {
  return Math.ceil((new Date(lastDay).getTime() - Date.now()) / 86_400_000);
}

const NAV: Record<Role, { key: Screen; label: string; needsResult?: boolean }[]> = {
  predecessor: [
    { key: 'home', label: '홈' },
    { key: 'connect', label: '① 연동' },
    { key: 'map', label: '② 업무 지도', needsResult: true },
    { key: 'interview', label: '③ 인터뷰', needsResult: true },
  ],
  successor: [
    { key: 'home', label: '홈' },
    { key: 'roadmap', label: '온보딩 로드맵', needsResult: true },
    { key: 'map', label: '업무 지도', needsResult: true },
  ],
};

// 데모: 역할 전환·새로고침에도 상태가 유지되도록 localStorage 백업
const LS_RESULT = 'ieum.result.v1';
const LS_CONNECTED = 'ieum.connected.v1';
const LS_PRIVACY = 'ieum.privacy.v1';
const LS_PROFILE = 'ieum.profile.v1';
const LS_ROLE_OVERRIDE = 'ieum.roleOverride.v1';
const LS_SOURCES = 'ieum.sources.v1';

// 분석 오버레이 stage1 하위 항목: 소스별 카운트 (업로드 응답 session에서 채워짐)
export type SourceSummary = { source: string; detail: string };

// purgeOriginals: 분석 완료 후 원문 삭제 토글 / purged: 실제 삭제 완료
// shared: 전임자가 후임자 공유 승인 / shareTo: 공유 대상(지정한 후임자 사내 이메일) — 그 사람만 열람
type Privacy = { purgeOriginals: boolean; purged: boolean; shared: boolean; shareTo?: string };

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패는 무시 — 데모 진행에 지장 없음
  }
}

export default function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [profile, setProfile] = useState<Profile | null>(() => load<Profile>(LS_PROFILE));
  const [screen, setScreen] = useState<Screen>('home');
  const [job, setJob] = useState<JobStatus | null>(null);
  const [result, setResultState] = useState<AnalyzeResult | null>(() => load<AnalyzeResult>(LS_RESULT));
  const [connected, setConnected] = useState<Partial<Record<ConnectorKey, string[]>>>(
    () => load<Partial<Record<ConnectorKey, string[]>>>(LS_CONNECTED) ?? {},
  );
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // 후임자로 접속한 회사 이메일 (로그인 시 입력) — 로그인 세션 한정, 저장하지 않음
  const [successorEmail, setSuccessorEmail] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceSummary[]>(() => load<SourceSummary[]>(LS_SOURCES) ?? []);
  const [analyzeStartedAt, setAnalyzeStartedAt] = useState<number | null>(null);
  const [consented, setConsented] = useState(false);
  const [privacy, setPrivacyState] = useState<Privacy>(
    () => load<Privacy>(LS_PRIVACY) ?? { purgeOriginals: true, purged: false, shared: false },
  );
  // AI 추정 역할의 사용자 수정본 (지도 헤더 연필 아이콘)
  const [roleOverride, setRoleOverrideState] = useState<string | null>(() =>
    load<string>(LS_ROLE_OVERRIDE),
  );
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const setResult = (r: AnalyzeResult | null) => {
    setResultState(r);
    if (r) save(LS_RESULT, r);
    else localStorage.removeItem(LS_RESULT);
  };

  const setPrivacy = (patch: Partial<Privacy>) => {
    setPrivacyState((prev) => {
      const next = { ...prev, ...patch };
      save(LS_PRIVACY, next);
      return next;
    });
  };

  const login = (r: Role, p?: Profile, successorEmail?: string) => {
    // 후임자는 초대받은 회사 이메일로 접속 — 그 이메일을 본인 신원으로 사용
    setSuccessorEmail(r === 'successor' ? (successorEmail ?? null) : null);
    // 새 전임자 로그인(새 profile 전달)이면 이전 분석 진행사항을 전부 초기화 —
    // stale한 result/connected/privacy/roleOverride가 새 인수인계에 새어나오지 않도록.
    // 후임자(profile 없음)는 전임자 결과를 봐야 하므로 초기화하지 않는다.
    if (p) {
      setProfile(p);
      save(LS_PROFILE, p);

      setResult(null);
      setConnected({});
      setSources([]);
      setPrivacyState({ purgeOriginals: true, purged: false, shared: false });
      setRoleOverrideState(null);
      setJob(null);
      setConsented(false);
      setAnalyzeStartedAt(null);
      if (timer.current) clearInterval(timer.current);

      localStorage.removeItem(LS_RESULT);
      localStorage.removeItem(LS_CONNECTED);
      localStorage.removeItem(LS_PRIVACY);
      localStorage.removeItem(LS_SOURCES);
      localStorage.removeItem(LS_ROLE_OVERRIDE);

      // 서버 세션도 새 분석으로 격리 (실패해도 데모 흐름은 계속)
      void resetSession();
    }
    setRole(r);
    setScreen('home');
    setHighlightId(null);
  };

  const onFiles = (files: File[]) => {
    void uploadFiles(files).then((res) => {
      // 서버는 파일 내용으로 소스를 판별 — 파일명으로 매칭하고, 응답에 없는 파일은 파일명 추론 폴백
      const serverByName = new Map(res?.uploaded?.map((u) => [u.filename, u.source]) ?? []);
      const known = new Set(CONNECTORS.map((c) => c.key as string));
      setConnected((prev) => {
        const next = { ...prev };
        for (const f of files) {
          const server = serverByName.get(f.name);
          // 서버가 판별한 소스가 UI 커넥터에 없으면(예: officechat) 카드 점등 없이 통과
          const key = server
            ? known.has(server)
              ? (server as ConnectorKey)
              : null
            : inferSource(f.name);
          if (key) next[key] = [...(next[key] ?? []), f.name];
        }
        save(LS_CONNECTED, next);
        return next;
      });
      // 세션 누적 소스 요약(카운트) — 분석 오버레이 하위 항목용
      if (res?.session?.length) {
        setSources(res.session);
        save(LS_SOURCES, res.session);
      }
    });
  };

  const start = async () => {
    const purge = privacy.purgeOriginals;
    setAnalyzeStartedAt(Date.now());
    const jobId = await startAnalyze(
      purge,
      profile ? { name: profile.name, lastDay: profile.lastDay } : undefined,
    );
    setJob({ status: 'running', stage: 'parse', stageDetail: '시작 중…' });
    timer.current = setInterval(async () => {
      const s = await pollJob(jobId);
      setJob(s);
      if (s.status !== 'running') {
        if (timer.current) clearInterval(timer.current);
        if (s.status === 'done' && s.result) {
          setResult(s.result);
          if (purge) {
            // 원문 삭제: 파일명을 상태·localStorage에서 지우고 연동 여부만 남김
            setConnected((prev) => {
              const next = Object.fromEntries(Object.keys(prev).map((k) => [k, []]));
              save(LS_CONNECTED, next);
              return next;
            });
            setPrivacy({ purged: true });
          }
          setTimeout(() => setScreen('map'), 600); // 완료 체크 잠깐 보여주고 전환
        }
      }
    }, 2000);
  };

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const onAnswered = (id: string, answer: string, card?: { title: string; body: string }) => {
    if (!result) return;
    setResult({
      ...result,
      questions: result.questions.map((q) => (q.id === id ? { ...q, answer, card } : q)),
    });
  };

  const goToMapCard = (cardId: string) => {
    setHighlightId(cardId);
    setScreen('map');
  };

  const saveRole = (v: string) => {
    setRoleOverrideState(v);
    save(LS_ROLE_OVERRIDE, v);
    void patchProfile(v);
  };

  if (!role) return <LoginScreen onStart={login} />;

  const interviewCards = result ? toInterviewCards(result.questions) : [];
  // 후임자는 전임자가 공유했고(shared), 그 공유 대상(shareTo)이 접속한 이메일과 일치할 때만 열람 가능.
  // shareTo가 아직 없으면(구버전 흐름) 공유 여부만으로 허용.
  const successorMatched =
    !privacy.shareTo ||
    privacy.shareTo.trim().toLowerCase() === (successorEmail ?? '').trim().toLowerCase();
  const successorResult = privacy.shared && successorMatched ? result : null;
  const inferredRole = roleOverride ?? result?.workMap.person.inferredRole ?? result?.workMap.person.team ?? '';
  // 후임자는 전임자가 초대한 계정으로 열람 — 지정된 수신자 이름을 헤더에 표시
  const displayName = role === 'predecessor' ? (profile?.name ?? '') : (successorEmail ?? '후임자');
  const subLabel =
    role === 'predecessor'
      ? profile
        ? `전임자 · 퇴사 D-${dDay(profile.lastDay)}`
        : '전임자'
      : '온보딩';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-[1280px] items-center gap-8 px-6 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black tracking-tight text-indigo-600">이음</span>
            <span className="text-xs text-neutral-400">AI 인수인계</span>
          </div>
          <nav className="flex gap-1">
            {NAV[role].map((t) => {
              const enabled = !t.needsResult || !!(role === 'successor' ? successorResult : result);
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    if (!enabled) return;
                    setHighlightId(null);
                    setScreen(t.key);
                  }}
                  disabled={!enabled}
                  className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                    screen === t.key
                      ? 'bg-indigo-50 text-indigo-700'
                      : enabled
                        ? 'text-neutral-600 hover:bg-neutral-100'
                        : 'cursor-not-allowed text-neutral-300'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {role === 'predecessor' && result && (
              <button
                onClick={() => void exportHandover(result)}
                className="cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                📤 인수인계서 내보내기
              </button>
            )}
            <div className="text-right">
              <div className="text-sm font-semibold leading-tight">{displayName}</div>
              <div className="text-[11px] text-neutral-400">{subLabel}</div>
            </div>
            <button
              onClick={() => setRole(null)}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600"
            >
              나가기
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-[1280px] px-6 py-6">
        {screen === 'home' && role === 'predecessor' && profile && (
          <PredecessorHome
            profile={profile}
            result={result}
            connectedCount={Object.keys(connected).length}
            onGo={setScreen}
          />
        )}
        {screen === 'home' && role === 'successor' && (
          <SuccessorHome result={successorResult} onGo={setScreen} />
        )}
        {screen === 'connect' && role === 'predecessor' && profile && (
          <ConnectScreen
            profile={profile}
            connected={connected}
            onFiles={onFiles}
            job={job}
            onStart={start}
            onRetry={start}
            sources={sources}
            analyzeStartedAt={analyzeStartedAt}
            consented={consented}
            onConsent={setConsented}
            purged={privacy.purged}
          />
        )}
        {screen === 'map' && role === 'predecessor' && result && (
          <WorkMapScreen
            map={result.workMap}
            interviewCards={interviewCards}
            highlightId={highlightId}
            inferredRole={inferredRole}
            onSaveRole={saveRole}
            share={{
              shared: privacy.shared,
              recipient: privacy.shareTo,
              onShare: (to) => setPrivacy({ shared: true, shareTo: to }),
            }}
          />
        )}
        {screen === 'map' && role === 'successor' && successorResult && (
          <WorkMapScreen
            map={successorResult.workMap}
            interviewCards={interviewCards}
            highlightId={highlightId}
            inferredRole={inferredRole}
          />
        )}
        {screen === 'interview' && role === 'predecessor' && result && (
          <InterviewScreen questions={result.questions} onAnswered={onAnswered} onGoToMap={goToMapCard} />
        )}
        {screen === 'roadmap' && role === 'successor' && successorResult && (
          <RoadmapScreen roadmap={successorResult.roadmap} map={successorResult.workMap} />
        )}
      </main>
    </div>
  );
}
