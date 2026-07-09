// 서버 pipeline/types.ts 계약 미러

export type Evidence = {
  source: 'slack' | 'email' | 'jira' | 'officenote' | 'officechat' | 'interview';
  ref: string;
  quote: string;
};

export type WorkMap = {
  // inferredRole: 서버가 추정 역할을 내려주면 사용, 없으면 클라이언트가 team으로 폴백
  person: { name: string; team: string; lastDay: string; inferredRole?: string };
  duties: {
    id: string;
    title: string;
    cadence: { type: 'weekly' | 'monthly' | 'quarterly' | 'adhoc'; detail: string };
    importance: 'high' | 'medium' | 'low';
    summary: string;
    evidence: Evidence[];
  }[];
  people: {
    id: string;
    name: string;
    org: string;
    internal: boolean;
    roleToPerson: string;
    tips?: string;
    evidence: Evidence[];
  }[];
  ongoing: {
    id: string;
    title: string;
    status: string;
    nextAction: string;
    due?: string;
    urgency: 'high' | 'medium' | 'low';
    urgencyReason: string;
    evidence: Evidence[];
  }[];
  landmines: {
    id: string;
    title: string;
    whatHappened: string;
    whyItMatters: string;
    doNot: string;
    evidence: Evidence[];
  }[];
  anomalies: { description: string; period?: string; evidence: Evidence[] }[];
};

export type RoadmapItem = {
  id: string;
  week: 0 | 1 | 2 | 4;
  title: string;
  description: string;
  due?: string;
  urgency: 'high' | 'medium' | 'low';
  urgencyReason?: string;
  relatedId?: string;
  evidence: Evidence[];
};

export type Question = {
  id: string;
  gapType: 'undocumented_incident' | 'missing_context' | 'stale_doc';
  observation: string;
  question: string;
  whyNeeded: string;
  evidence: Evidence[];
  answer?: string;
  // answer 저장 시 서버가 지도 카드를 내려주면 채워짐 (없으면 클라이언트가 질문+답변으로 합성)
  card?: { title: string; body: string };
};

// 인터뷰 답변으로 업무 지도에 추가되는 카드
export type InterviewCard = {
  id: string;
  title: string;
  body: string;
  gapType: Question['gapType'];
  evidence: Evidence[];
};

export function toInterviewCards(questions: Question[]): InterviewCard[] {
  return questions
    .filter((q) => q.answer)
    .map((q) => ({
      id: q.id,
      title: q.card?.title ?? q.question,
      body: q.card?.body ?? q.answer!,
      gapType: q.gapType,
      evidence: q.evidence,
    }));
}

export type AnalyzeResult = { workMap: WorkMap; roadmap: RoadmapItem[]; questions: Question[] };

export type JobStatus = {
  status: 'running' | 'done' | 'error';
  stage: string;
  stageDetail: string;
  error?: string;
  result?: AnalyzeResult;
  // 서버가 진행이 멈췄다고 판단하면 true (없으면 클라이언트가 경과 시간으로 백업 판정)
  stuck?: boolean;
};

// purgeOriginals: 분석 완료 후 원문 파일 삭제 요청 — 서버(세션 ①)가 body를 아직 안 읽어도 무해
// profile: 입력한 전임자 이름/퇴사일 — 서버가 없으면 DEMO_PROFILE(김하늘)로 폴백하므로 함께 전달
export async function startAnalyze(
  purgeOriginals: boolean,
  profile?: { name: string; lastDay: string },
): Promise<string> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile ? { purgeOriginals, profile } : { purgeOriginals }),
  });
  return (await res.json()).jobId;
}

// 새 전임자 로그인 시 서버 세션을 새 분석으로 격리 — 미구현/실패여도 데모 흐름은 계속
export async function resetSession(): Promise<void> {
  try {
    await fetch('/api/session/reset', { method: 'POST' });
  } catch {
    // 서버 미기동/미구현이어도 클라이언트 초기화만으로 데모 진행
  }
}

export async function pollJob(jobId: string): Promise<JobStatus> {
  const res = await fetch(`/api/analyze/${jobId}`);
  return res.json();
}

// 서버(세션 ①) answer 확장: 응답에 card가 포함될 수 있음 — { ok, card?: { title, body } }
export async function saveAnswer(
  questionId: string,
  answer: string,
): Promise<{ card?: { title: string; body: string } }> {
  try {
    const res = await fetch(`/api/questions/${questionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    });
    if (res.ok) return await res.json();
  } catch {
    // 서버 미기동/미구현이어도 데모 흐름은 클라이언트 상태로 계속
  }
  return {};
}

// 파일 업로드 — /api/upload. 서버는 파일 내용으로 소스를 판별하고,
// 판별 실패 파일은 uploaded에서 빠지고 errors로 옴 → 파일명 매칭이 인덱스 매칭보다 안전
export type UploadResponse = {
  ok: boolean;
  sources?: string[];
  uploaded?: { filename: string; source: string; detail?: string }[];
  // 세션 누적 소스별 요약 (예: { source: 'email', detail: '메일 14통' }) — 분석 오버레이 하위 항목 카운트에 사용
  session?: { source: string; detail: string }[];
  errors?: { filename: string; error: string }[];
};

export async function uploadFiles(files: File[]): Promise<UploadResponse | null> {
  try {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (res.ok) return await res.json();
  } catch {
    // 엔드포인트 미구현 시 클라이언트 파일명 추론으로 폴백
  }
  return null;
}

// AI 추정 프로필 수정 — PATCH /api/profile (세션 ① 스키마: { inferredRole })
export async function patchProfile(inferredRole: string): Promise<void> {
  try {
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inferredRole }),
    });
  } catch {
    // 미구현이어도 클라이언트 상태로 유지
  }
}

// 인수인계서 내보내기 — /api/export 우선, 실패 시 클라이언트에서 Markdown 생성
export async function exportHandover(result: AnalyzeResult): Promise<void> {
  try {
    const res = await fetch('/api/export');
    if (res.ok) {
      downloadBlob(await res.blob(), exportFilename(result));
      return;
    }
  } catch {
    // 폴백으로 진행
  }
  const md = buildHandoverMarkdown(result);
  downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), exportFilename(result));
}

const exportFilename = (r: AnalyzeResult) => `인수인계서_${r.workMap.person.name}.md`;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildHandoverMarkdown({ workMap: m, roadmap, questions }: AnalyzeResult): string {
  const lines: string[] = [
    `# ${m.person.name} 인수인계서`,
    ``,
    `${m.person.team} · 퇴사일 ${m.person.lastDay} · 이음(AI 인수인계) 자동 생성`,
    ``,
    `## 담당 업무`,
    ...m.duties.map((d) => `- **${d.title}** (${d.cadence.detail}, 중요도 ${d.importance}) — ${d.summary}`),
    ``,
    `## 진행 중인 일`,
    ...m.ongoing.map((o) => `- **${o.title}** (${o.status}${o.due ? `, ~${o.due}` : ''}) — 다음 액션: ${o.nextAction}`),
    ``,
    `## 관계자`,
    ...m.people.map((p) => `- **${p.name}** (${p.org}${p.internal ? '' : ', 외부'}) — ${p.roleToPerson}${p.tips ? ` / 💡 ${p.tips}` : ''}`),
    ``,
    `## 주의 — 문서에 없는 히스토리`,
    ...m.landmines.map((l) => `- **${l.title}** — ${l.whatHappened} / 🚫 ${l.doNot}`),
    ``,
    `## 온보딩 로드맵`,
    ...roadmap.map((r) => `- [${r.week === 0 ? '즉시' : r.week === 4 ? '한 달 내' : `${r.week}주차`}] **${r.title}** — ${r.description}`),
    ``,
    `## 인터뷰 — 기록되지 않았던 지식`,
    ...questions.flatMap((q) => [`- **Q. ${q.question}**`, `  - A. ${q.answer ?? '(미답변)'}`]),
    ``,
  ];
  return lines.join('\n');
}
