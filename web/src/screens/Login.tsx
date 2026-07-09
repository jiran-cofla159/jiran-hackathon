import type { Role } from '../App';

const ACCOUNTS: {
  role: Role;
  name: string;
  title: string;
  desc: string;
  badge: string;
  badgeClass: string;
}[] = [
  {
    role: 'kim',
    name: '김하늘',
    title: '대리 · 플랫폼사업팀',
    desc: '파트너사 계약·정산 담당 · 2021년 입사',
    badge: '퇴사 예정 D-22',
    badgeClass: 'bg-red-50 text-red-600 border-red-200',
  },
  {
    role: 'lee',
    name: '이도현',
    title: '사원 · 플랫폼사업팀',
    desc: '신규 입사 · 김하늘 대리 업무 인계 예정',
    badge: '입사 8일차',
    badgeClass: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  },
];

export function LoginScreen({ onLogin }: { onLogin: (role: Role) => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-indigo-50 via-white to-white px-6">
      <div className="mb-12 text-center">
        <div className="mb-3 text-5xl font-black tracking-tight text-indigo-600">이음</div>
        <p className="text-lg font-medium text-neutral-700">사람이 떠나도, 지식은 남도록.</p>
        <p className="mt-1 text-sm text-neutral-500">
          활동 데이터에서 기록된 적 없는 업무 지식까지 꺼내는 AI 인수인계
        </p>
      </div>

      <div className="grid w-[640px] grid-cols-2 gap-4">
        {ACCOUNTS.map((a) => (
          <button
            key={a.role}
            onClick={() => onLogin(a.role)}
            className="group cursor-pointer rounded-2xl border border-neutral-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-2xl font-bold text-indigo-700">
                {a.name.slice(0, 1)}
              </span>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${a.badgeClass}`}>
                {a.badge}
              </span>
            </div>
            <div className="text-lg font-bold">{a.name}</div>
            <div className="text-sm text-neutral-500">{a.title}</div>
            <div className="mt-1 text-xs text-neutral-400">{a.desc}</div>
            <div className="mt-4 text-sm font-semibold text-indigo-600 opacity-0 transition group-hover:opacity-100">
              이 계정으로 시작 →
            </div>
          </button>
        ))}
      </div>

      <p className="mt-8 text-xs text-neutral-400">데모 계정 — 비밀번호 없이 로그인됩니다</p>
    </div>
  );
}
