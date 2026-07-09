import { useState } from 'react';
import { saveAnswer, type Question } from '../api';
import { Badge, Card, EvidenceChips } from '../ui';

const GAP_META: Record<Question['gapType'], { label: string; tone: 'red' | 'amber' | 'indigo' }> = {
  undocumented_incident: { label: '기록되지 않은 사건', tone: 'red' },
  missing_context: { label: '맥락 누락', tone: 'amber' },
  stale_doc: { label: '문서 업데이트 필요', tone: 'indigo' },
};

export function InterviewScreen({
  questions,
  onAnswered,
  onGoToMap,
}: {
  questions: Question[];
  onAnswered: (id: string, answer: string, card?: { title: string; body: string }) => void;
  onGoToMap: (cardId: string) => void;
}) {
  const answered = questions.filter((q) => q.answer).length;
  // 답변 개수 비례 단순 계산: 시작 87% → 전부 답변 시 100%
  const completeness = 87 + Math.round((13 * answered) / Math.max(questions.length, 1));

  return (
    <div className="space-y-5">
      <Card className="!p-5">
        <div className="text-lg font-semibold">
          지도를 만들다 발견한, <span className="text-indigo-600">어디에도 기록되지 않은 지식</span>이 있습니다.
        </div>
        <div className="mt-0.5 text-sm text-neutral-500">답변하면 업무 지도에 카드로 추가됩니다.</div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs font-medium">
            <span className="text-neutral-500">인수인계 완성도</span>
            <span className={completeness === 100 ? 'text-emerald-600' : 'text-indigo-600'}>
              {completeness}%{answered < questions.length && ' → 100%'}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={`h-full rounded-full transition-all duration-700 ${completeness === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
              style={{ width: `${completeness}%` }}
            />
          </div>
        </div>
      </Card>

      {questions.map((q, i) => (
        <QuestionCard key={q.id} q={q} index={i} onAnswered={onAnswered} onGoToMap={onGoToMap} />
      ))}
    </div>
  );
}

function QuestionCard({
  q,
  index,
  onAnswered,
  onGoToMap,
}: {
  q: Question;
  index: number;
  onAnswered: (id: string, answer: string, card?: { title: string; body: string }) => void;
  onGoToMap: (cardId: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const meta = GAP_META[q.gapType];

  if (q.answer) {
    return (
      <Card className="card-in border-emerald-200 bg-emerald-50/40 !py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2 text-sm">
            <span className="shrink-0 font-semibold text-emerald-700">✓ 기록됨</span>
            <span className="truncate text-neutral-600">
              Q{index + 1}. {q.question}
            </span>
          </div>
          <button
            onClick={() => onGoToMap(q.id)}
            className="shrink-0 cursor-pointer rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
          >
            🗺️ 지도에 카드 추가됨 — 보러 가기 →
          </button>
        </div>
      </Card>
    );
  }

  const submit = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    const { card } = await saveAnswer(q.id, draft.trim());
    onAnswered(q.id, draft.trim(), card);
  };

  return (
    <Card className="!p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-bold text-neutral-400">Q{index + 1}</span>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>
      <blockquote className="rounded-lg bg-neutral-100 px-3.5 py-2.5 text-sm leading-relaxed text-neutral-600">
        {q.observation}
        <EvidenceChips evidence={q.evidence} />
      </blockquote>
      <p className="mt-3.5 text-lg font-semibold leading-snug">{q.question}</p>
      <p className="mt-1.5 text-xs text-neutral-500">💬 {q.whyNeeded}</p>
      <div className="mt-3.5 flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="답변을 입력하세요…"
          className="flex-1 resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || saving}
          className="cursor-pointer self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          {saving ? '저장 중…' : '기록하기'}
        </button>
      </div>
    </Card>
  );
}
