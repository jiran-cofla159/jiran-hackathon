// DESIGN.md §3 — 파이프라인 계약서

export type Evidence = {
  source: 'slack' | 'email' | 'jira' | 'officenote' | 'officechat';
  ref: string;
  quote: string;
};

export type SourceFindings = {
  source: string;
  duties: { title: string; cadence?: string; evidence: Evidence[] }[];
  people: {
    name: string;
    org: string;
    internal: boolean;
    relationship: string;
    tips?: string;
    evidence: Evidence[];
  }[];
  ongoing: {
    title: string;
    statusSummary: string;
    nextAction?: string;
    due?: string;
    evidence: Evidence[];
  }[];
  landmines: { title: string; context: string; advice: string; evidence: Evidence[] }[];
  anomalies: { description: string; period?: string; evidence: Evidence[] }[];
};

export type WorkMap = {
  person: { name: string; team: string; lastDay: string };
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
  anomalies: SourceFindings['anomalies'];
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
};

// ---- 프롬프트에 첨부할 타입 정의 텍스트 (§4: 타입 미첨부 시 필드명이 임의로 바뀜) ----

export const EVIDENCE_TYPE_TEXT = `type Evidence = {
  source: 'slack' | 'email' | 'jira' | 'officenote' | 'officechat';
  ref: string;      // "email m-009", "jira PLT-88#c2", "slack plt-partners@2026-06-24", "officechat room-dm-dohyun"
  quote: string;    // 원문 인용 1~2문장
};`;

export const SOURCE_FINDINGS_TYPE_TEXT = `${EVIDENCE_TYPE_TEXT}

type SourceFindings = {
  source: string;
  duties: { title: string; cadence?: string; evidence: Evidence[] }[];        // 반복 업무 단서
  people: { name: string; org: string; internal: boolean; relationship: string;
            tips?: string; evidence: Evidence[] }[];                          // 관계자 + 암묵지 팁
  ongoing: { title: string; statusSummary: string; nextAction?: string;
             due?: string; evidence: Evidence[] }[];                          // 진행 중인 일
  landmines: { title: string; context: string; advice: string; evidence: Evidence[] }[]; // 히스토리·주의사항
  anomalies: { description: string; period?: string; evidence: Evidence[] }[]; // 설명 안 되는 패턴 (역질문 재료)
};`;

export const WORK_MAP_TYPE_TEXT = `${EVIDENCE_TYPE_TEXT}

type WorkMap = {
  person: { name: string; team: string; lastDay: string };  // "2026-07-31"
  duties: { id: string; title: string; cadence: { type: 'weekly'|'monthly'|'quarterly'|'adhoc'; detail: string };
            importance: 'high'|'medium'|'low'; summary: string; evidence: Evidence[] }[];
  people: { id: string; name: string; org: string; internal: boolean;
            roleToPerson: string; tips?: string; evidence: Evidence[] }[];
  ongoing: { id: string; title: string; status: string; nextAction: string; due?: string;
             urgency: 'high'|'medium'|'low'; urgencyReason: string; evidence: Evidence[] }[];
  landmines: { id: string; title: string; whatHappened: string; whyItMatters: string;
               doNot: string; evidence: Evidence[] }[];
  anomalies: { description: string; period?: string; evidence: Evidence[] }[];
};`;

export const ROADMAP_TYPE_TEXT = `${EVIDENCE_TYPE_TEXT}

type RoadmapItem = {
  id: string; week: 0 | 1 | 2 | 4;   // 0=즉시, 1=1주차, 2=2주차, 4=한 달 내
  title: string; description: string; due?: string;
  urgency: 'high'|'medium'|'low'; urgencyReason?: string;  // "회신 없이 4일 경과" 등
  relatedId?: string;                // WorkMap duties/ongoing id
  evidence: Evidence[];
};
// 출력: { items: RoadmapItem[] }`;

export const QUESTION_TYPE_TEXT = `${EVIDENCE_TYPE_TEXT}

type Question = {
  id: string;
  gapType: 'undocumented_incident' | 'missing_context' | 'stale_doc';
  observation: string;   // AI가 관찰한 사실
  question: string;      // 전임자에게 던지는 질문
  whyNeeded: string;     // 후임자에게 왜 필요한가
  evidence: Evidence[];
};
// 출력: { questions: Question[] }`;

export const JSON_ONLY_RULE = (typeText: string) =>
  `위 지시에 따라 아래 TypeScript 타입에 맞는 JSON만 출력하라. 필드명·evidence 구조를 타입 정의와 정확히 일치시켜라 (예: gapType을 type으로 바꾸지 말 것, evidence는 {source, ref, quote}). 설명 문장 금지.\n\n${typeText}`;
