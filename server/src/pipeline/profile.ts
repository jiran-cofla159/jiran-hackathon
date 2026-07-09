// 분석 대상자 프로필 — 시작 시 사용자가 입력. 데모 계정만 김하늘/이도현을 쓴다.
// 프롬프트는 이 프로필로 템플릿화하되, DEMO_PROFILE은 기존 프롬프트 문자열을
// 바이트 단위로 재현해야 한다(스테이지 캐시 키 보존). 수정 시 반드시 캐시 히트로 검증할 것.

export type Profile = {
  name: string;
  lastDay: string; // "2026-07-31"
  today: string; // 긴급도 계산 기준일
  team: string; // WorkMap.person.team (조직 정보, 없으면 '')
  titleHint?: string; // 프롬프트용 직함 힌트 (예: "플랫폼사업팀 대리"). 실사용자는 미상
  successorName: string; // 후임자 지칭
};

export const DEMO_PROFILE: Profile = {
  name: '김하늘',
  lastDay: '2026-07-31',
  today: '2026-07-06',
  team: '플랫폼사업팀',
  titleHint: '플랫폼사업팀 대리',
  successorName: '이도현 사원',
};

export function realProfile(name: string, lastDay: string, today: string): Profile {
  return { name, lastDay, today, team: '', successorName: '후임 담당자' };
}

// 대상자 지칭: 데모는 "김하늘 (플랫폼사업팀 대리, ...)", 실사용자는 직함 생략
function subject(p: Profile, tail: string): string {
  return p.titleHint ? `${p.name} (${p.titleHint}, ${tail})` : `${p.name} (${tail})`;
}

export const personLine = {
  stage1: (p: Profile) => `분석 대상자: ${subject(p, `${p.lastDay} 퇴사 예정`)}. 오늘: ${p.today}.`,
  stage2: (p: Profile) =>
    `대상자: ${subject(p, `퇴사일 ${p.lastDay}`)}. 오늘: ${p.today}. 후임자: ${p.successorName}(신입).`,
  stage3bIntro: (p: Profile) =>
    `오늘: ${p.today}. 전임자: ${p.name} (퇴사일 ${p.lastDay}). 후임자: ${p.successorName}(신입).`,
};

// stage3a week 범위 힌트 — today 기준으로 계산 (데모 2026-07-06이면 7/12, 7/13~7/26 재현)
const addDaysMD = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

export const stage3aWeekHint = (p: Profile): string =>
  `week는 오늘(${p.today})부터 센다: week 1 = ~${addDaysMD(p.today, 6)}, week 2 = ${addDaysMD(p.today, 7)}~${addDaysMD(p.today, 20)} 부근(3주차 개념 포함), week 4 = 그 이후 한 달 내.`;

export const stage3aIntro = (p: Profile): string =>
  `너는 신입 후임자(${p.successorName})의 첫 한 달 온보딩 로드맵을 설계한다. 오늘: ${p.today}. 전임자 퇴사일: ${p.lastDay}.`;
