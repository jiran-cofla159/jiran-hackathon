import type { AnalyzeResult } from '../api';
import { Badge, Card } from '../ui';

const KIM_STEPS = ['데이터 연동', 'AI 분석', '업무 지도', '인터뷰', '내보내기'];

export function KimHome({
  result,
  connectedCount,
  onGo,
}: {
  result: AnalyzeResult | null;
  connectedCount: number;
  onGo: (screen: 'connect' | 'map' | 'interview') => void;
}) {
  const answered = result?.questions.filter((q) => q.answer).length ?? 0;
  const total = result?.questions.length ?? 0;
  // 진행 단계: 연동 전 0 → 연동 1 → 분석 완료 3 → 답변 시작 4 → 전부 답변 5
  const stepDone = !result ? (connectedCount > 0 ? 1 : 0) : answered === 0 ? 3 : answered < total ? 4 : 5;

  return (
    <div className="space-y-6">
      <Card className="flex items-center justify-between !p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-2xl font-bold text-indigo-700">
            김
          </span>
          <div>
            <div className="text-xl font-bold">
              김하늘 님, 안녕하세요
              <span className="ml-2 text-sm font-normal text-neutral-500">대리 · 플랫폼사업팀</span>
            </div>
            <div className="text-sm text-neutral-500">파트너사 계약·정산 담당 · 2021년 입사</div>
          </div>
        </div>
        <Badge tone="red">퇴사 예정 D-22 · 2026-07-31</Badge>
      </Card>

      <Card className="!p-8 text-center">
        <div className="text-2xl font-bold">
          {stepDone < 3 ? (
            <>
              떠나기 전, <span className="text-indigo-600">인수인계를 시작하세요</span>
            </>
          ) : stepDone < 5 ? (
            <>
              업무 지도가 완성됐습니다. <span className="text-indigo-600">마지막 조각만 남았어요</span>
            </>
          ) : (
            <>
              인수인계가 <span className="text-emerald-600">완성되었습니다</span>
            </>
          )}
        </div>
        <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-500">
          {stepDone < 3
            ? '5년간의 메일·Slack·Jira·문서에서 기록된 적 없는 업무 지식까지 AI가 꺼내 후임자의 지도로 만듭니다.'
            : stepDone < 5
              ? `AI가 어디에도 기록되지 않은 지식 ${total}건을 발견했습니다. ${answered}건 답변 완료 — 답할 때마다 지도에 새 카드가 추가됩니다.`
              : '후임자 이도현 님이 로드맵과 업무 지도를 열람할 수 있습니다. 인수인계서로 내보낼 수도 있어요.'}
        </p>

        <div className="mx-auto mt-7 flex w-fit items-center">
          {KIM_STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              {i > 0 && <div className={`h-0.5 w-10 ${i < stepDone ? 'bg-indigo-400' : 'bg-neutral-200'}`} />}
              <div className="flex flex-col items-center gap-1.5 px-1">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    i < stepDone
                      ? 'bg-indigo-600 text-white'
                      : i === stepDone
                        ? 'border-2 border-indigo-500 bg-white text-indigo-600'
                        : 'bg-neutral-100 text-neutral-400'
                  }`}
                >
                  {i < stepDone ? '✓' : i + 1}
                </span>
                <span className={`text-[11px] font-medium ${i <= stepDone ? 'text-neutral-700' : 'text-neutral-400'}`}>
                  {s}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-center gap-3">
          {!result ? (
            <CtaButton onClick={() => onGo('connect')}>인수인계 시작하기 →</CtaButton>
          ) : answered < total ? (
            <>
              <CtaButton onClick={() => onGo('interview')}>
                인터뷰 이어서 하기 ({answered}/{total})
              </CtaButton>
              <GhostButton onClick={() => onGo('map')}>업무 지도 보기</GhostButton>
            </>
          ) : (
            <GhostButton onClick={() => onGo('map')}>업무 지도 보기</GhostButton>
          )}
        </div>
      </Card>
    </div>
  );
}

export function LeeHome({
  result,
  onGo,
}: {
  result: AnalyzeResult | null;
  onGo: (screen: 'roadmap' | 'map') => void;
}) {
  const urgent = result?.roadmap.filter((r) => r.week === 0).length ?? 0;
  const answered = result?.questions.filter((q) => q.answer).length ?? 0;

  return (
    <div className="space-y-6">
      <Card className="flex items-center justify-between !p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700">
            이
          </span>
          <div>
            <div className="text-xl font-bold">
              이도현 님, 안녕하세요
              <span className="ml-2 text-sm font-normal text-neutral-500">사원 · 플랫폼사업팀</span>
            </div>
            <div className="text-sm text-neutral-500">입사 8일차</div>
          </div>
        </div>
        <Badge tone="indigo">김하늘 님 업무 인계 중</Badge>
      </Card>

      {result ? (
        <Card className="!p-8 text-center">
          <div className="text-2xl font-bold">
            김하늘 님의 <span className="text-indigo-600">업무 지식이 준비되어 있습니다</span>
          </div>
          <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-500">
            AI가 5년치 활동 데이터에서 만든 온보딩 로드맵을 따라가세요. 전임자 인터뷰로 채워진
            지식에는 <b>인터뷰 답변</b> 배지가 붙어 있습니다.
          </p>
          <div className="mt-6 flex justify-center gap-8">
            {[
              { n: result.roadmap.length, label: '로드맵 항목' },
              { n: urgent, label: '즉시 할 일', accent: urgent > 0 },
              { n: result.workMap.duties.length, label: '인계 업무' },
              { n: answered, label: '인터뷰 답변' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className={`text-2xl font-bold ${s.accent ? 'text-red-600' : 'text-indigo-600'}`}>{s.n}</div>
                <div className="text-xs text-neutral-500">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 flex justify-center gap-3">
            <CtaButton onClick={() => onGo('roadmap')}>첫 한 달 로드맵 보기 →</CtaButton>
            <GhostButton onClick={() => onGo('map')}>업무 지도 열람</GhostButton>
          </div>
        </Card>
      ) : (
        <Card className="!p-10 text-center">
          <div className="text-3xl">⏳</div>
          <div className="mt-3 text-lg font-semibold">아직 인계받을 내용이 없습니다</div>
          <p className="mt-1 text-sm text-neutral-500">
            김하늘 님이 데이터 연동과 분석을 마치면 이곳에 온보딩 로드맵이 나타납니다.
          </p>
        </Card>
      )}
    </div>
  );
}

function CtaButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer rounded-xl border border-neutral-200 bg-white px-6 py-3 text-sm font-semibold text-neutral-700 transition hover:border-indigo-300 hover:text-indigo-700"
    >
      {children}
    </button>
  );
}
