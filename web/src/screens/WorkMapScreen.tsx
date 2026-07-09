import { useEffect, useRef } from 'react';
import type { InterviewCard, WorkMap } from '../api';
import { Avatar, Badge, Card, EvidenceChips, urgencyTone } from '../ui';

const cadenceLabel = (c: WorkMap['duties'][number]['cadence']) =>
  ({ weekly: '매주', monthly: '매월', quarterly: '분기', adhoc: '상시' })[c.type];

const GAP_LABEL: Record<InterviewCard['gapType'], string> = {
  undocumented_incident: '기록되지 않은 사건',
  missing_context: '맥락 누락',
  stale_doc: '문서 업데이트 필요',
};

export function WorkMapScreen({
  map,
  interviewCards = [],
  highlightId,
}: {
  map: WorkMap;
  interviewCards?: InterviewCard[];
  highlightId?: string | null;
}) {
  const highlightRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId]);

  const stats = [
    { label: '담당 업무', n: map.duties.length },
    { label: '관계자', n: map.people.length },
    { label: '진행 중', n: map.ongoing.length },
    { label: '주의', n: map.landmines.length },
    ...(interviewCards.length ? [{ label: '인터뷰 답변', n: interviewCards.length }] : []),
  ];
  const order = { high: 0, medium: 1, low: 2 };
  const duties = [...map.duties].sort((a, b) => order[a.importance] - order[b.importance]);
  const ongoing = [...map.ongoing].sort((a, b) => order[a.urgency] - order[b.urgency]);

  return (
    <div className="space-y-6">
      <Card className="flex items-center justify-between !p-5">
        <div>
          <div className="text-lg font-semibold">
            {map.person.name}의 업무 지도
            <span className="ml-2 text-sm font-normal text-neutral-500">
              {map.person.team} · 퇴사 {map.person.lastDay}
            </span>
          </div>
          <div className="mt-0.5 text-sm text-neutral-500">
            활동 데이터에서 자동 추출된 지식입니다. 칩을 누르면 근거 원문을 확인할 수 있습니다.
          </div>
        </div>
        <div className="flex gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-bold text-indigo-600">{s.n}</div>
              <div className="text-xs text-neutral-500">{s.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {interviewCards.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">
            💬 인터뷰로 채워진 지식 — 전임자가 직접 답한, 어디에도 없던 내용
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {interviewCards.map((c) => (
              <Card
                key={c.id}
                className={`card-in border-indigo-200 bg-indigo-50/40 ${
                  highlightId === c.id ? 'ring-2 ring-indigo-400' : ''
                }`}
              >
                <div ref={highlightId === c.id ? highlightRef : undefined} className="mb-2 flex items-center gap-1.5">
                  <Badge tone="indigo">✍️ 인터뷰 답변</Badge>
                  <Badge>{GAP_LABEL[c.gapType]}</Badge>
                </div>
                <div className="font-semibold">{c.title}</div>
                <p className="mt-1.5 rounded-lg bg-white px-3 py-2 text-sm leading-relaxed text-neutral-700">
                  {c.body}
                </p>
                <EvidenceChips evidence={c.evidence} />
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-5">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">📋 담당 업무</h2>
          <div className="space-y-3">
            {duties.map((d) => (
              <Card key={d.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{d.title}</div>
                  <div className="flex shrink-0 gap-1.5">
                    <Badge tone="indigo">
                      {cadenceLabel(d.cadence)}
                    </Badge>
                    <Badge tone={urgencyTone(d.importance)}>{d.importance}</Badge>
                  </div>
                </div>
                <div className="mt-1 text-xs text-neutral-500">{d.cadence.detail}</div>
                <p className="mt-1.5 text-sm text-neutral-700">{d.summary}</p>
                <EvidenceChips evidence={d.evidence} />
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">🔥 진행 중인 일</h2>
          <div className="space-y-3">
            {ongoing.map((o) => (
              <Card key={o.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{o.title}</div>
                  <div className="flex shrink-0 gap-1.5">
                    {o.due && <Badge>~{o.due}</Badge>}
                    <Badge tone={urgencyTone(o.urgency)}>{o.urgency}</Badge>
                  </div>
                </div>
                <p className="mt-1.5 text-sm text-neutral-700">
                  다음 액션: <b>{o.nextAction}</b>
                </p>
                <p className="mt-1 text-xs font-medium text-red-600">⚠ {o.urgencyReason}</p>
                <EvidenceChips evidence={o.evidence} />
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">👥 관계자 맵</h2>
          {(['내부', '외부'] as const).map((group) => {
            const people = map.people.filter((p) => (group === '내부') === p.internal);
            if (!people.length) return null;
            return (
              <div key={group} className="mb-3">
                <div className="mb-2 text-xs font-medium text-neutral-400">{group}</div>
                <div className="space-y-2">
                  {people.map((p) => (
                    <Card key={p.id} className="!p-3">
                      <div className="flex items-start gap-3">
                        <Avatar name={p.name} dim={group === '외부'} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{p.name}</span>
                            <span className="text-xs text-neutral-500">{p.org}</span>
                            {p.tips && (
                              <span className="group relative cursor-help text-sm">
                                💡
                                <span className="invisible absolute left-0 top-6 z-20 w-72 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900 shadow-lg group-hover:visible">
                                  {p.tips}
                                </span>
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-neutral-600">{p.roleToPerson}</div>
                          <EvidenceChips evidence={p.evidence} />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">⚠️ 지뢰밭 — 문서에 없는 히스토리</h2>
          <div className="space-y-3">
            {map.landmines.map((l) => (
              <Card key={l.id} className="border-amber-200 bg-amber-50/50">
                <div className="font-semibold text-amber-900">{l.title}</div>
                <p className="mt-1.5 text-sm text-neutral-700">{l.whatHappened}</p>
                <p className="mt-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-sm font-medium text-red-700">
                  🚫 {l.doNot}
                </p>
                <EvidenceChips evidence={l.evidence} />
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
