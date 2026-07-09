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

export function RoadmapScreen({
  roadmap,
  map,
  onGoToMap,
}: {
  roadmap: RoadmapItem[];
  map: WorkMap;
  // 항목의 relatedId를 업무 지도 카드로 점프 (하이라이트)
  onGoToMap?: (id: string) => void;
}) {
  const [done, setDone] = useState<Set<string>>(loadDone);

  const toggle = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(LS_DONE, JSON.stringify([...next]));
      } catch {
        // 저장 실패는 무시 — 데모 진행에 지장 없음
      }
      return next;
    });
  };

  // 단계 순서: week 오름차순 → 같은 주 안에서는 urgency(high→low) → 원래 배열 순.
  const steps = roadmap
    .map((r, idx) => ({ r, idx }))
    .sort((a, b) => {
      if (a.r.week !== b.r.week) return a.r.week - b.r.week;
      const u = URGENCY_ORDER[a.r.urgency] - URGENCY_ORDER[b.r.urgency];
      if (u !== 0) return u;
      return a.idx - b.idx;
    })
    .map((x) => x.r);

  const total = steps.length;
  const doneCount = steps.filter((r) => done.has(r.id)).length;
  const pct = total ? Math.round((doneCount * 100) / total) : 0;
  const complete = total > 0 && doneCount === total;

  // 지금 할 일 = 순서상 첫 번째 미완료 항목
  const focusIdx = steps.findIndex((r) => !done.has(r.id));
  const focus = focusIdx >= 0 ? steps[focusIdx] : null;

  return (
    <div className="space-y-4">
      <Card className="!p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="text-lg font-semibold">첫 한 달 할 일</div>
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
          순서대로 한 단계씩 따라가세요 · 막히면 <span className="font-medium">🗺️ 업무 지도</span>에서 전체 그림을 · 전임자 퇴사일 {map.person.lastDay}
        </div>
      </Card>

      {/* 지금 할 일 — 포커스 카드 (주인공) */}
      {focus ? (
        <FocusCard
          key={focus.id}
          item={focus}
          step={focusIdx + 1}
          total={total}
          people={mentionedPeople(focus, map.people)}
          onDone={() => toggle(focus.id)}
          onGoToMap={onGoToMap}
        />
      ) : (
        <Card className="card-in border-emerald-200 bg-emerald-50/50 !p-8 text-center">
          <div className="text-3xl">🎉</div>
          <div className="mt-2 text-lg font-bold text-emerald-800">첫 한 달 할 일을 모두 마쳤습니다</div>
          <p className="mt-1 text-sm text-neutral-500">
            언제든 아래 경로에서 지난 단계를 다시 열어볼 수 있어요.
          </p>
        </Card>
      )}

      {/* 전체 경로 — 보조 타임라인 */}
      <div>
        <h2 className="mb-2 ml-1 text-xs font-semibold text-neutral-400">전체 경로</h2>
        <div className="relative ml-3 border-l-2 border-neutral-200 pb-2 pl-8">
          {steps.map((r, i) => {
            const isDone = done.has(r.id);
            const isFocus = focus?.id === r.id;
            // 아직 순서가 오지 않은 미래 단계 (포커스 이후)
            const isFuture = focusIdx >= 0 && i > focusIdx && !isDone;
            return (
              <div key={r.id} className="pt-3 first:pt-1">
                <div className="relative">
                  <span
                    className={`absolute -left-[41px] top-1.5 h-3 w-3 rounded-full border-4 border-neutral-50 ${
                      isDone
                        ? 'bg-emerald-500'
                        : isFocus
                          ? 'bg-indigo-600 ring-2 ring-indigo-300'
                          : 'bg-neutral-300'
                    }`}
                  />
                  <button
                    onClick={() => toggle(r.id)}
                    className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                      isFocus ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-neutral-50'
                    } ${isDone ? 'opacity-55' : ''}`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                        isDone
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-neutral-300 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <div className="min-w-0 flex-1">
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
  people,
  onDone,
  onGoToMap,
}: {
  item: RoadmapItem;
  step: number;
  total: number;
  people: WorkMap['people'];
  onDone: () => void;
  onGoToMap?: (id: string) => void;
}) {
  const urgent = item.week === 0;
  return (
    <Card className={`card-in !p-6 ${urgent ? 'border-l-4 !border-l-red-500' : 'border-indigo-200'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-indigo-500">지금 할 일</span>
          <span className="text-xs font-medium text-neutral-400">· {step}/{total}단계</span>
        </div>
        <Badge tone={urgent ? 'red' : 'indigo'}>{WEEK_LABEL[item.week]}</Badge>
      </div>

      <div className="mt-2 text-xl font-bold leading-snug">{item.title}</div>
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
            🗺️ 지도에서 자세히
          </button>
        )}
      </div>

      <EvidenceChips evidence={item.evidence} />

      <button
        onClick={onDone}
        className="mt-5 w-full cursor-pointer rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
      >
        ✓ 완료했어요 — 다음 단계로
      </button>
    </Card>
  );
}
