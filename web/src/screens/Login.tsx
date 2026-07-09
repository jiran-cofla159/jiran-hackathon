import { useState } from 'react';
import type { Profile, Role } from '../App';

export function LoginScreen({
  onStart,
}: {
  onStart: (role: Role, profile?: Profile, successorEmail?: string) => void;
}) {
  const [path, setPath] = useState<'predecessor' | 'successor' | null>(null);
  const [name, setName] = useState('');
  const [lastDay, setLastDay] = useState('');
  const [email, setEmail] = useState('');
  const ready = name.trim() && lastDay;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-indigo-50 via-white to-white px-6">
      <div className="mb-12 text-center">
        <div className="mb-3 text-5xl font-black tracking-tight text-indigo-600">이음</div>
        <p className="text-lg font-medium text-neutral-700">사람이 떠나도, 지식은 남도록.</p>
        <p className="mt-1 text-sm text-neutral-500">
          한 사람의 머릿속에만 있던 업무를, 다음 사람이 헤매지 않게 이어드립니다
        </p>
      </div>

      {!path ? (
        <div className="grid w-[680px] grid-cols-2 gap-4">
          <button
            onClick={() => setPath('predecessor')}
            className="group cursor-pointer rounded-2xl border border-neutral-200 bg-white p-7 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg"
          >
            <div className="text-3xl">🧳</div>
            <div className="mt-4 text-lg font-bold">떠날 준비를 합니다</div>
            <div className="mt-1 text-sm text-neutral-500">
              내 활동 데이터로 인수인계 지도를 만듭니다
            </div>
            <div className="mt-4 text-sm font-semibold text-indigo-600 opacity-0 transition group-hover:opacity-100">
              인수인계 만들기 →
            </div>
          </button>
          <button
            onClick={() => setPath('successor')}
            className="group cursor-pointer rounded-2xl border border-neutral-200 bg-white p-7 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg"
          >
            <div className="text-3xl">🌱</div>
            <div className="mt-4 text-lg font-bold">새 업무를 인계받았습니다</div>
            <div className="mt-1 text-sm text-neutral-500">
              전임자가 공유한 온보딩 로드맵을 봅니다
            </div>
            <div className="mt-4 text-sm font-semibold text-indigo-600 opacity-0 transition group-hover:opacity-100">
              온보딩 보기 →
            </div>
          </button>
        </div>
      ) : path === 'successor' ? (
        <form
          className="w-[420px] rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (emailValid) onStart('successor', undefined, email.trim());
          }}
        >
          <div className="text-lg font-bold">온보딩 로드맵 열람</div>
          <p className="mt-1 text-sm text-neutral-500">
            전임자가 초대한 회사 이메일로 접속하세요.
          </p>
          <label className="mt-5 block">
            <span className="text-xs font-semibold text-neutral-500">회사 이메일</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="예: lee@company.com"
              autoFocus
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </label>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setPath(null)}
              className="cursor-pointer rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
            >
              ← 뒤로
            </button>
            <button
              type="submit"
              disabled={!emailValid}
              className="flex-1 cursor-pointer rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
            >
              온보딩 보기
            </button>
          </div>
        </form>
      ) : (
        <form
          className="w-[420px] rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) onStart('predecessor', { name: name.trim(), lastDay });
          }}
        >
          <div className="text-lg font-bold">인수인계 만들기</div>
          <label className="mt-5 block">
            <span className="text-xs font-semibold text-neutral-500">이름</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 김하늘"
              autoFocus
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </label>
          <label className="mt-4 block">
            <span className="text-xs font-semibold text-neutral-500">퇴사 예정일</span>
            <input
              type="date"
              value={lastDay}
              onChange={(e) => setLastDay(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </label>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setPath(null)}
              className="cursor-pointer rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
            >
              ← 뒤로
            </button>
            <button
              type="submit"
              disabled={!ready}
              className="flex-1 cursor-pointer rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
            >
              시작하기
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
