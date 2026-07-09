import { useEffect, useRef, useState } from 'react';
import {
  exportHandover,
  pollJob,
  startAnalyze,
  toInterviewCards,
  uploadFiles,
  type AnalyzeResult,
  type JobStatus,
} from './api';
import { ConnectScreen, inferSource, type ConnectorKey } from './screens/Connect';
import { KimHome, LeeHome } from './screens/Home';
import { InterviewScreen } from './screens/InterviewScreen';
import { LoginScreen } from './screens/Login';
import { RoadmapScreen } from './screens/RoadmapScreen';
import { WorkMapScreen } from './screens/WorkMapScreen';

export type Role = 'kim' | 'lee';
type Screen = 'home' | 'connect' | 'map' | 'interview' | 'roadmap';

const NAV: Record<Role, { key: Screen; label: string; needsResult?: boolean }[]> = {
  kim: [
    { key: 'home', label: '홈' },
    { key: 'connect', label: '① 연동' },
    { key: 'map', label: '② 업무 지도', needsResult: true },
    { key: 'interview', label: '③ 인터뷰', needsResult: true },
  ],
  lee: [
    { key: 'home', label: '홈' },
    { key: 'roadmap', label: '온보딩 로드맵', needsResult: true },
    { key: 'map', label: '업무 지도', needsResult: true },
  ],
};

const ROLE_LABEL: Record<Role, { name: string; sub: string }> = {
  kim: { name: '김하늘', sub: '전임자 · 퇴사 D-22' },
  lee: { name: '이도현', sub: '후임자 · 입사 8일차' },
};

// 데모: 역할 전환·새로고침에도 분석 결과가 유지되도록 localStorage 백업
const LS_RESULT = 'ieum.result.v1';
const LS_CONNECTED = 'ieum.connected.v1';

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [job, setJob] = useState<JobStatus | null>(null);
  const [result, setResultState] = useState<AnalyzeResult | null>(() => load<AnalyzeResult>(LS_RESULT));
  const [connected, setConnected] = useState<Partial<Record<ConnectorKey, string[]>>>(
    () => load<Partial<Record<ConnectorKey, string[]>>>(LS_CONNECTED) ?? {},
  );
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const setResult = (r: AnalyzeResult | null) => {
    setResultState(r);
    try {
      if (r) localStorage.setItem(LS_RESULT, JSON.stringify(r));
      else localStorage.removeItem(LS_RESULT);
    } catch {
      // 저장 실패는 무시 — 데모 진행에 지장 없음
    }
  };

  const login = (r: Role) => {
    setRole(r);
    setScreen('home');
    setHighlightId(null);
  };

  const onFiles = (files: File[]) => {
    void uploadFiles(files).then((res) => {
      // 서버가 소스를 판별해주면 사용, 아니면 파일명 추론 폴백
      setConnected((prev) => {
        const next = { ...prev };
        const serverSources = res?.sources as ConnectorKey[] | undefined;
        files.forEach((f, i) => {
          const key = serverSources?.[i] ?? inferSource(f.name);
          next[key] = [...(next[key] ?? []), f.name];
        });
        try {
          localStorage.setItem(LS_CONNECTED, JSON.stringify(next));
        } catch {
          // 무시
        }
        return next;
      });
    });
  };

  const start = async () => {
    const jobId = await startAnalyze();
    setJob({ status: 'running', stage: 'parse', stageDetail: '시작 중…' });
    timer.current = setInterval(async () => {
      const s = await pollJob(jobId);
      setJob(s);
      if (s.status !== 'running') {
        if (timer.current) clearInterval(timer.current);
        if (s.status === 'done' && s.result) {
          setResult(s.result);
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

  if (!role) return <LoginScreen onLogin={login} />;

  const interviewCards = result ? toInterviewCards(result.questions) : [];

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
              const enabled = !t.needsResult || !!result;
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
            {role === 'kim' && result && (
              <button
                onClick={() => void exportHandover(result)}
                className="cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                📤 인수인계서 내보내기
              </button>
            )}
            <div className="text-right">
              <div className="text-sm font-semibold leading-tight">{ROLE_LABEL[role].name}</div>
              <div className="text-[11px] text-neutral-400">{ROLE_LABEL[role].sub}</div>
            </div>
            <button
              onClick={() => setRole(null)}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-[1280px] px-6 py-6">
        {screen === 'home' && role === 'kim' && (
          <KimHome result={result} connectedCount={Object.keys(connected).length} onGo={setScreen} />
        )}
        {screen === 'home' && role === 'lee' && <LeeHome result={result} onGo={setScreen} />}
        {screen === 'connect' && role === 'kim' && (
          <ConnectScreen connected={connected} onFiles={onFiles} job={job} onStart={start} />
        )}
        {screen === 'map' && result && (
          <WorkMapScreen map={result.workMap} interviewCards={interviewCards} highlightId={highlightId} />
        )}
        {screen === 'roadmap' && role === 'lee' && result && (
          <RoadmapScreen roadmap={result.roadmap} map={result.workMap} />
        )}
        {screen === 'interview' && role === 'kim' && result && (
          <InterviewScreen questions={result.questions} onAnswered={onAnswered} onGoToMap={goToMapCard} />
        )}
      </main>
    </div>
  );
}
