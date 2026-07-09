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

  const weeks = [0, 1, 2, 4].filter((w) => roadmap.some((r) => r.week === w));
  const doneCount = roadmap.filter((r) => done.has(r.id)).length;
  const total = roadmap.length;
  const pct = total ? Math.round((doneCount * 100) / total) : 0;
  const complete = total > 0 && doneCount === total;

  // "지금 여기": 아직 완료 안 된 항목이 남은 가장 이른 주차. 체크할수록 앞으로 이동한다.
  // (온보딩 시작일이 없으므로 날짜 대신 진행 상태 기준 — 항상 급한 구간부터 가리킨다)
  const currentWeek = weeks.find((w) => roadmap.some((r) => r.week === w && !done.has(r.id)));

  return (
    <div className="space-y-2">
      <Card className="!p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="text-lg font-semibold">첫 한 달 할 일</div>
          <span
            className={`shrink-0 text-sm font-semibold ${complete ? 'text-emerald-600' : 'text-indigo-600'}`}
          >
            {complete ? '✓ 전부 완료' : `${doneCount}/${total} 완료`}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${complete ? 'bg-emerald-500' : 'bg-indigo-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-neutral-400">
          급한 일부터 하나씩 체크하세요 · 전체 담당 업무는 <span className="font-medium">🗺️ 업무 지도</span>에서 · 전임자 퇴사일 {map.person.lastDay}
        </div>
      </Card>

      <div className="relative ml-3 border-l-2 border-neutral-200 pb-4 pl-8">
        {weeks.map((w) => {
          const isNow = w === currentWeek;
          return (
            <div key={w} className="pt-6">
              <div className="relative mb-2.5 flex items-center gap-2">
                <span
                  className={`absolute -left-[45px] top-1 h-4 w-4 rounded-full border-4 border-neutral-50 ${
                    isNow ? 'bg-indigo-600 ring-2 ring-indigo-300' : 'bg-neutral-300'
                  }`}
                />
                <h2 className={`text-base font-bold ${w === 0 ? 'text-red-600' : 'text-neutral-800'}`}>
                  {WEEK_LABEL[w]}
                </h2>
                {isNow && (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                    ← 지금 여기
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {roadmap
                  .filter((r) => r.week === w)
                  .map((r) => {
                    const people = mentionedPeople(r, map.people);
                    const isDone = done.has(r.id);
                    return (
                      <Card
                        key={r.id}
                        className={`!p-3.5 transition ${w === 0 && !isDone ? 'border-l-4 !border-l-red-500' : ''} ${
                          isDone ? 'opacity-55' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => toggle(r.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-indigo-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div
                                className={`text-sm font-semibold ${isDone ? 'text-neutral-400 line-through' : ''}`}
                              >
                                {r.title}
                              </div>
                              <div className="flex shrink-0 gap-1.5">
                                {r.due && <Badge>~{r.due}</Badge>}
                                <Badge tone={urgencyTone(r.urgency)}>{r.urgency}</Badge>
                              </div>
                            </div>
                            {!isDone && r.urgencyReason && (
                              <p className="mt-0.5 text-xs font-medium text-red-600">⚠ {r.urgencyReason}</p>
                            )}
                            {!isDone && (
                              <p className="mt-1 text-xs leading-relaxed text-neutral-600">{r.description}</p>
                            )}
                            {!isDone && (people.length > 0 || (r.relatedId && onGoToMap)) && (
                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
                                {r.relatedId && onGoToMap && (
                                  <button
                                    onClick={() => onGoToMap(r.relatedId!)}
                                    className="cursor-pointer rounded-md border border-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600 transition hover:border-indigo-300 hover:text-indigo-700"
                                  >
                                    🗺️ 지도에서 자세히
                                  </button>
                                )}
                              </div>
                            )}
                            {!isDone && <EvidenceChips evidence={r.evidence} />}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
