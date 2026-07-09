import type { RoadmapItem, WorkMap } from '../api';
import { Avatar, Badge, Card, EvidenceChips, urgencyTone } from '../ui';

const WEEK_LABEL: Record<number, string> = {
  0: '🚨 즉시',
  1: '1주차',
  2: '2주차',
  4: '한 달 내',
};

// description에 언급된 관계자를 아바타로 표시
function mentionedPeople(item: RoadmapItem, people: WorkMap['people']) {
  return people.filter((p) => item.description.includes(p.name));
}

export function RoadmapScreen({ roadmap, map }: { roadmap: RoadmapItem[]; map: WorkMap }) {
  const weeks = [0, 1, 2, 4].filter((w) => roadmap.some((r) => r.week === w));

  return (
    <div className="space-y-2">
      <Card className="!p-5">
        <div className="text-lg font-semibold">첫 한 달 온보딩 로드맵</div>
        <div className="mt-1 text-sm text-neutral-600">
          <span className="font-medium text-indigo-600">언제 · 무엇부터</span> 하면 되는지, 급한 일부터 한 달 뒤까지 시간 순서로 정리한 실행 계획입니다.
        </div>
        <div className="mt-1.5 text-xs text-neutral-400">
          전체 담당 업무·관계자는 <span className="font-medium">업무 지도</span>에서 볼 수 있어요 · 전임자 퇴사일 {map.person.lastDay}
        </div>
      </Card>

      <div className="relative ml-3 border-l-2 border-neutral-200 pb-4 pl-8">
        {weeks.map((w) => (
          <div key={w} className="pt-6">
            <div className="relative mb-3">
              <span className="absolute -left-[45px] top-0.5 h-4 w-4 rounded-full border-4 border-neutral-50 bg-indigo-600" />
              <h2 className={`text-base font-bold ${w === 0 ? 'text-red-600' : 'text-neutral-800'}`}>
                {WEEK_LABEL[w]}
              </h2>
            </div>
            <div className="space-y-3">
              {roadmap
                .filter((r) => r.week === w)
                .map((r) => {
                  const people = mentionedPeople(r, map.people);
                  return (
                    <Card key={r.id} className={w === 0 ? 'border-l-4 !border-l-red-500' : ''}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold">{r.title}</div>
                        <div className="flex shrink-0 gap-1.5">
                          {r.due && <Badge>~{r.due}</Badge>}
                          <Badge tone={urgencyTone(r.urgency)}>{r.urgency}</Badge>
                        </div>
                      </div>
                      {r.urgencyReason && (
                        <p className="mt-1 text-xs font-medium text-red-600">⚠ {r.urgencyReason}</p>
                      )}
                      <p className="mt-1.5 text-sm leading-relaxed text-neutral-700">{r.description}</p>
                      {people.length > 0 && (
                        <div className="mt-2.5 flex items-center gap-1.5">
                          <span className="text-xs text-neutral-400">물어볼 사람</span>
                          {people.map((p) => (
                            <span key={p.id} className="flex items-center gap-1">
                              <Avatar name={p.name} dim={!p.internal} />
                              <span className="text-xs text-neutral-600">{p.name}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      <EvidenceChips evidence={r.evidence} />
                    </Card>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
