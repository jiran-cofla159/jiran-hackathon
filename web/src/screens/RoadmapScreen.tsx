import { useState } from 'react';
import type { RoadmapItem, WorkMap } from '../api';
import { Avatar, Badge, Card, EvidenceChips, urgencyTone } from '../ui';

const WEEK_LABEL: Record<number, string> = {
  0: '🚨 즉시',
  1: '1주차',
  2: '2주차',
  4: '한 달 내',
};

// 체크 완료 항목 id — localStorage에 영속(새로고침 유지). 서버 불필요.
const LS_DONE = 'ieum.roadmapDone.v1';

function loadDone(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_DONE);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

// description에 언급된 관계자를 아바타로 표시
function mentionedPeople(item: RoadmapItem, people: WorkMap['people']) {
  return people.filter((p) => item.description.includes(p.name));
}

const URGENCY_ORDER = { high: 0, medium: 1, low: 2 };

// 단계 순서: week 오름차순 → 같은 주 안에서는 urgency(high→low) → 원래 배열 순.
function orderSteps(roadmap: RoadmapItem[]): RoadmapItem[] {
  return roadmap
    .map((r, idx) => ({ r, idx }))
    .sort((a, b) => {
      if (a.r.week !== b.r.week) return a.r.week - b.r.week;
      const u = URGENCY_ORDER[a.r.urgency] - URGENCY_ORDER[b.r.urgency];
      if (u !== 0) return u;
      return a.idx - b.idx;
    })
    .map((x) => x.r);
}

export function RoadmapScreen({
  roadmap,
  map,
  predecessorName,
  onGoToMap,
}: {
  roadmap: RoadmapItem[];
  map: WorkMap;
  // 누구에게 인계받는지 헤더에 표시
  predecessorName?: string;
  // 항목의 relatedId를 업무 지도 카드로 점프 (하이라이트)
  onGoToMap?: (id: string) => void;
}) {
  const steps = orderSteps(roadmap);
  const total = steps.length;

  const [done, setDone] = useState<Set<string>>(loadDone);
  // 보고 있는 단계 — 완료 여부와 무관하게 앞뒤로 넘겨볼 수 있다. 초기값은 첫 미완료 단계.
  const [focusIndex, setFocusIndex] = useState(() => {
    const d = loadDone();
    const i = steps.findIndex((r) => !d.has(r.id));
    return i >= 0 ? i : 0;
  });

  const persist = (next: Set<string>) => {
    try {
      localStorage.setItem(LS_DONE, JSON.stringify([...next]));
    } catch {
      // 저장 실패는 무시 — 데모 진행에 지장 없음
    }
  };

  const toggle = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
      return next;
    });
  };

  // 현재 단계 완료 처리 후, 다음 미완료 단계로 포커스 전진
  const completeAndAdvance = () => {
    const cur = steps[focusIndex];
    if (!cur) return;
    const next = new Set(done);
    next.add(cur.id);
    persist(next);
    setDone(next);
    const nextIdx = steps.findIndex((r) => !next.has(r.id));
    if (nextIdx >= 0) setFocusIndex(nextIdx);
  };

  const doneCount = steps.filter((r) => done.has(r.id)).length;
  const pct = total ? Math.round((doneCount * 100) / total) : 0;
  const complete = total > 0 && doneCount === total;
  const focus = total > 0 ? steps[Math.min(focusIndex, total - 1)] : null;

  return (
    <div className="space-y-4">
      <Card className="!p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">첫 한 달 할 일</div>
            {predecessorName && (
              <div className="mt-0.5 text-xs text-neutral-500">
                <span className="font-medium text-indigo-600">{predecessorName}</span> 님에게 인계받는 첫 한 달입니다
              </div>
            )}
          </div>
          <span
            className={`shrink-0 text-sm font-semibold ${complete ? 'text-emerald-600' : 'text-indigo-600'}`}
          >
            {complete ? '✓ 전 단계 완료' : `${doneCount}/${total} 단계 완료`}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${complete ? 'bg-emerald-500' : 'bg-indigo-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-neutral-400">
          순서대로 한 단계씩 따라가세요 · 막히면 <span className="font-medium">전체 업무 한눈에</span> 탭에서 전체 그림을 · 전임자 퇴사일 {map.person.lastDay}
        </div>
      </Card>

      {/* 지금 할 일 — 포커스 카드 (주인공) */}
      {complete ? (
        <Card className="card-in border-emerald-200 bg-emerald-50/50 !p-8 text-center">
          <div className="text-3xl">🎉</div>
          <div className="mt-2 text-lg font-bold text-emerald-800">첫 한 달 할 일을 모두 마쳤습니다</div>
          <p className="mt-1 text-sm text-neutral-500">
            언제든 아래 경로에서 지난 단계를 다시 열어볼 수 있어요.
          </p>
        </Card>
      ) : focus ? (
        <FocusCard
          key={focus.id}
          item={focus}
          step={focusIndex + 1}
          total={total}
          isDone={done.has(focus.id)}
          people={mentionedPeople(focus, map.people)}
          canPrev={focusIndex > 0}
          canNext={focusIndex < total - 1}
          onPrev={() => setFocusIndex((i) => Math.max(0, i - 1))}
          onNext={() => setFocusIndex((i) => Math.min(total - 1, i + 1))}
          onComplete={completeAndAdvance}
          onUndo={() => toggle(focus.id)}
          onGoToMap={onGoToMap}
        />
      ) : null}

      {/* 전체 경로 — 보조 타임라인 */}
      <div>
        <h2 className="mb-2 ml-1 text-xs font-semibold text-neutral-400">전체 경로</h2>
        <div className="relative ml-3 border-l-2 border-neutral-200 pb-2 pl-8">
          {steps.map((r, i) => {
            const isDone = done.has(r.id);
            const isFocus = i === focusIndex;
            // 아직 순서가 오지 않은 미래 단계 (포커스 이후, 미완료)
            const isFuture = i > focusIndex && !isDone;
            return (
              <div key={r.id} className="pt-3 first:pt-1">
                <div className="relative flex items-start gap-2.5">
                  <span
                    className={`absolute -left-[41px] top-1.5 h-3 w-3 rounded-full border-4 border-neutral-50 ${
                      isDone
                        ? 'bg-emerald-500'
                        : isFocus
                          ? 'bg-indigo-600 ring-2 ring-indigo-300'
                          : 'bg-neutral-300'
                    }`}
                  />
                  {/* 체크박스 = 완료 토글 (포커스 이동과 분리) */}
                  <button
                    onClick={() => toggle(r.id)}
                    aria-label={isDone ? '완료 취소' : '완료로 표시'}
                    className={`mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold transition ${
                      isDone
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-neutral-300 text-transparent hover:border-indigo-400'
                    }`}
                  >
                    ✓
                  </button>
                  {/* 행 클릭 = 포커스 이동 */}
                  <button
                    onClick={() => setFocusIndex(i)}
                    className={`min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-left transition ${
                      isFocus ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-neutral-50'
                    } ${isDone ? 'opacity-55' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-[11px] font-medium text-neutral-400">
                        {WEEK_LABEL[r.week]}
                      </span>
                      <span
                        className={`truncate text-sm ${
                          isDone
                            ? 'text-neutral-400 line-through'
                            : isFuture
                              ? 'font-medium text-neutral-400'
                              : 'font-medium text-neutral-800'
                        }`}
                      >
                        {r.title}
                      </span>
                      {isFocus && (
                        <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                          ← 지금 여기
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FocusCard({
  item,
  step,
  total,
  isDone,
  people,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onComplete,
  onUndo,
  onGoToMap,
}: {
  item: RoadmapItem;
  step: number;
  total: number;
  isDone: boolean;
  people: WorkMap['people'];
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onComplete: () => void;
  onUndo: () => void;
  onGoToMap?: (id: string) => void;
}) {
  const urgent = item.week === 0;
  return (
    <Card className={`card-in !p-6 ${urgent && !isDone ? 'border-l-4 !border-l-red-500' : 'border-indigo-200'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-indigo-500">
            {isDone ? '완료한 단계' : '지금 할 일'}
          </span>
          <span className="text-xs font-medium text-neutral-400">· {step}/{total}단계</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={urgent ? 'red' : 'indigo'}>{WEEK_LABEL[item.week]}</Badge>
          <div className="flex items-center gap-1">
            <NavBtn disabled={!canPrev} onClick={onPrev} label="이전 단계">
              ←
            </NavBtn>
            <NavBtn disabled={!canNext} onClick={onNext} label="다음 단계">
              →
            </NavBtn>
          </div>
        </div>
      </div>

      <div className={`mt-2 text-xl font-bold leading-snug ${isDone ? 'text-neutral-400 line-through' : ''}`}>
        {item.title}
      </div>
      {item.urgencyReason && (
        <p className="mt-1.5 text-sm font-medium text-red-600">⚠ {item.urgencyReason}</p>
      )}
      <p className="mt-2.5 text-sm leading-relaxed text-neutral-700">{item.description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Badge tone={urgencyTone(item.urgency)}>{item.urgency}</Badge>
        {item.due && <Badge>~{item.due}</Badge>}
        {people.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="text-xs text-neutral-400">물어볼 사람</span>
            {people.map((p) => (
              <span key={p.id} className="flex items-center gap-1">
                <Avatar name={p.name} dim={!p.internal} />
                <span className="text-xs text-neutral-600">{p.name}</span>
              </span>
            ))}
          </span>
        )}
        {item.relatedId && onGoToMap && (
          <button
            onClick={() => onGoToMap(item.relatedId!)}
            className="cursor-pointer rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition hover:border-indigo-300 hover:text-indigo-700"
          >
            🗺️ 전체 업무에서 자세히
          </button>
        )}
      </div>

      <EvidenceChips evidence={item.evidence} />

      {isDone ? (
        <button
          onClick={onUndo}
          className="mt-5 w-full cursor-pointer rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-50"
        >
          ✓ 완료됨 — 완료 취소
        </button>
      ) : (
        <button
          onClick={onComplete}
          className="mt-5 w-full cursor-pointer rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          ✓ 완료했어요 — 다음 단계로
        </button>
      )}
    </Card>
  );
}

function NavBtn({
  children,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 text-sm text-neutral-600 transition hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
