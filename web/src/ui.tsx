import { useState, type ReactNode } from 'react';
import type { Evidence } from './api';

export const SOURCE_META: Record<Evidence['source'], { icon: string; label: string }> = {
  email: { icon: '✉️', label: '이메일' },
  slack: { icon: '💬', label: 'Slack' },
  jira: { icon: '🎫', label: 'Jira' },
  officenote: { icon: '📝', label: '오피스노트' },
  officechat: { icon: '💭', label: '오피스챗' },
  interview: { icon: '🎙️', label: '전임자 인터뷰' },
};

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-neutral-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'red' | 'amber' | 'green' | 'indigo';
}) {
  const tones = {
    neutral: 'bg-neutral-100 text-neutral-700 border-neutral-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export const urgencyTone = (u: 'high' | 'medium' | 'low') =>
  u === 'high' ? 'red' : u === 'medium' ? 'amber' : ('neutral' as const);

export function Avatar({ name, dim = false }: { name: string; dim?: boolean }) {
  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        dim ? 'bg-neutral-100 text-neutral-400' : 'bg-indigo-100 text-indigo-700'
      }`}
    >
      {name.slice(0, 1)}
    </span>
  );
}

// Evidence 칩 + 원문 인용 팝오버 — 신뢰성 연출의 핵심
export function EvidenceChips({ evidence }: { evidence: Evidence[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!evidence?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {evidence.map((e, i) => {
        const meta = SOURCE_META[e.source] ?? { icon: '📄', label: e.source };
        return (
          <span key={i} className="relative">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                open === i
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-indigo-200 hover:bg-indigo-50'
              }`}
            >
              {meta.icon} {meta.label}
            </button>
            {open === i && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpen(null)} />
                <div className="absolute left-0 top-7 z-20 w-80 rounded-lg border border-neutral-200 bg-white p-3 text-left shadow-lg">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                    {meta.icon} {meta.label}
                    <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">{e.ref}</code>
                  </div>
                  <blockquote className="border-l-2 border-indigo-300 pl-2.5 text-[13px] leading-relaxed text-neutral-700">
                    “{e.quote}”
                  </blockquote>
                </div>
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
