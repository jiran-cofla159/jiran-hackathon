import type { AnalyzeResult } from '../api';
import { dDay, type Profile } from '../App';
import { Badge, Card } from '../ui';

const STEPS = ['데이터 연동', 'AI 분석', '업무 지도', '인터뷰', '내보내기'];

export function PredecessorHome({
  profile,
  result,
  connectedCount,
  onGo,
}: {
  profile: Profile;
  result: AnalyzeResult | null;
  connectedCount: number;
  onGo: (screen: 'connect' | 'map' | 'interview') => void;
}) {
  const answered = result?.questions.filter((q) => q.answer).length ?? 0;
  const total = result?.questions.length ?? 0;
  // 진행 단계: 연동 전 0 → 연동 1 → 분석 완료 3 → 답변 시작 4 → 전부 답변 5
  const stepDone = !result ? (connectedCount > 0 ? 1 : 0) : answered === 0 ? 3 : answered < total ? 4 : 5;
  const d = dDay(profile.lastDay);

  return (
    <div className="space-y-6">
      <Card className="flex items-center justify-between !p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-2xl font-bold text-indigo-700">
            {profile.name.slice(0, 1)}
          </span>
          <div>
            <div className="text-xl font-bold">{profile.name} 님, 안녕하세요</div>
          </div>
        </div>
        <Badge tone="red">퇴사 예정 D-{d} · {profile.lastDay}</Badge>
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
            ? '빈 문서 앞에서 막막하셨죠. 당연해서 안 적은 일, 나만 알던 히스토리까지 — 흩어진 메일·메신저·이슈에서 AI가 짚어 인수인계 초안을 대신 만듭니다.'
            : stepDone < 5
              ? `기록되지 않은 지식 ${total}건 중 ${answered}건 답변 완료.`
              : '후임자가 로드맵과 업무 지도를 열람할 수 있습니다.'}
        </p>

        <div className="mx-auto mt-7 flex w-fit items-center">
          {STEPS.map((s, i) => (
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

// 후임자 랜딩('첫 한 달 할 일')에서 아직 공유받은 인수인계가 없을 때의 잠금 상태
export function SuccessorLocked() {
  return (
    <div className="space-y-6">
      <Card className="flex items-center gap-4 !p-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700">
          🌱
        </span>
        <div className="text-xl font-bold">새 업무 온보딩</div>
      </Card>

      <Card className="!p-10 text-center">
        <div className="text-3xl">🔒</div>
        <div className="mt-3 text-lg font-semibold">이 계정으로 공유된 인수인계가 없습니다</div>
        <p className="mt-1 text-sm text-neutral-500">
          전임자가 업무 지도를 검토한 뒤 이 이메일로 공유하면, 이곳에 첫 한 달 할 일이 나타납니다.
        </p>
      </Card>
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
