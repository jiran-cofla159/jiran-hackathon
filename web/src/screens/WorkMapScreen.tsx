import { useEffect, useRef, useState } from 'react';
import type { InterviewCard, WorkMap } from '../api';
import { Avatar, Badge, Card, EvidenceChips, urgencyTone } from '../ui';

const cadenceLabel = (c: WorkMap['duties'][number]['cadence']) =>
  ({ weekly: '매주', monthly: '매월', quarterly: '분기', adhoc: '상시' })[c.type];

// AI가 데이터에서 추정한 역할 (표시 전용) — 수정은 분석 중 직무 확인 스텝에서 이뤄진다
function InferredRole({ role }: { role: string }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <Badge tone="indigo">AI 추정</Badge>
      <span className="text-sm font-medium text-neutral-700">{role}</span>
    </div>
  );
}

// 후임자 지정 공유 — 사내 이메일로 수신자를 특정해야 공유된다 (그 사람만 열람)
function ShareControl({
  shared,
  recipient,
  onShare,
}: {
  shared: boolean;
  recipient?: string;
  onShare: (recipient: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  if (shared) {
    return (
      <span className="ml-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
        ✓ {recipient ?? '후임자'} 님에게 공유됨
      </span>
    );
  }

  return (
    <div className="relative ml-2 flex flex-col items-end gap-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
      >
        후임자에게 공유
      </button>
      <span className="text-[11px] text-neutral-400">🔒 공유 전까지 후임자에게 보이지 않습니다</span>
      {open && (
        <div className="absolute right-0 top-12 z-20 w-80 rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-xl">
          <div className="text-sm font-semibold">인수인계 공유</div>
          <label className="mt-3 block text-xs font-medium text-neutral-500">받는 사람 (사내 이메일)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && valid && onShare(email.trim())}
            placeholder="예: lee@company.com"
            autoFocus
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-400">
            초대받은 이 계정만 업무 지도와 로드맵을 열람할 수 있습니다.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="cursor-pointer rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50"
            >
              취소
            </button>
            <button
              disabled={!valid}
              onClick={() => onShare(email.trim())}
              className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              초대 보내기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const GAP_LABEL: Record<InterviewCard['gapType'], string> = {
  undocumented_incident: '기록되지 않은 사건',
  missing_context: '맥락 누락',
  stale_doc: '문서 업데이트 필요',
};

export function WorkMapScreen({
  map,
  interviewCards = [],
  highlightId,
  inferredRole,
  share,
}: {
  map: WorkMap;
  interviewCards?: InterviewCard[];
  highlightId?: string | null;
  inferredRole?: string;
  // 전임자 화면에서만 전달 — 공유 통제권이 전임자에게 있음. recipient: 지정한 후임자
  share?: { shared: boolean; recipient?: string; onShare: (recipient: string) => void };
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
      <Card className="flex items-start justify-between gap-6 !p-5">
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">
            {map.person.name}의 업무 지도
            <span className="ml-2 text-sm font-normal text-neutral-500">퇴사 {map.person.lastDay}</span>
          </div>
          <InferredRole role={inferredRole ?? map.person.team} />
          <div className="mt-1 text-sm text-neutral-600">
            <span className="font-medium text-indigo-600">무엇을 맡는지</span> — 담당 업무·관계자·진행 중인 일·주의사항을 한눈에 보는 전체 지도입니다.
          </div>
          <div className="mt-0.5 text-xs text-neutral-400">칩을 누르면 근거 원문을 볼 수 있습니다.</div>
        </div>
        <div className="flex shrink-0 items-center gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-bold text-indigo-600">{s.n}</div>
              <div className="whitespace-nowrap text-xs text-neutral-500">{s.label}</div>
            </div>
          ))}
          {share && (
            <ShareControl shared={share.shared} recipient={share.recipient} onShare={share.onShare} />
          )}
        </div>
      </Card>

      {interviewCards.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-neutral-500">💬 인터뷰로 채워진 지식</h2>
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
