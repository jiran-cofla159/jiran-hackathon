import { callLLM, MODELS } from '../llm/adapter.js';
import { DEMO_PROFILE, stage3aIntro, stage3aWeekHint, personLine, type Profile } from './profile.js';
import {
  JSON_ONLY_RULE,
  QUESTION_TYPE_TEXT,
  ROADMAP_TYPE_TEXT,
  type Question,
  type RoadmapItem,
  type WorkMap,
} from './types.js';

const buildSystem3A = (p: Profile) => `${stage3aIntro(p)}
설계 원칙:
- week 0(즉시)에는 데드라인이 이미 지났거나 상대가 기다리는 일.
- ${stage3aWeekHint(p)}
- 반복 업무는 마감일(due)이 아니라 **후임자가 처음 그 업무의 실행에 착수해야 하는 시점(착수 시작일)** 기준으로 주차를 정하고 "이 업무가 돌아옵니다"체로 예고한다.
  (예: 마감 8/10이지만 역산 착수가 D-15 ≈ 7/26이면 착수일 기준 week 2에 배치.)
  경계에 걸치면 늦게 배치해 준비 시간을 놓치느니 한 주 이르게 배치하라.
- 각 항목에 '누구에게 물어보면 되는지'를 description에 포함 (WorkMap.people 활용).
- 신입 눈높이: 업무명만 쓰지 말고 무엇을 하는 일인지 한 줄 설명.
- relatedId에는 관련된 WorkMap duties/ongoing의 id를 넣는다.

${JSON_ONLY_RULE(ROADMAP_TYPE_TEXT)}`;

const buildSystem3B = (p: Profile) => `너는 인수인계 문서의 구멍을 찾아 전임자에게 인터뷰 질문을 만드는 역할이다. ${personLine.stage3bIntro(p)}
구멍의 유형:
- undocumented_incident: 활동이 몰렸는데(anomalies) 결론·조치가 어느 문서에도 없음.
- missing_context: 지도에 있는 업무·관계 중 '왜'가 설명되지 않는 것.
- stale_doc: 문서가 존재하지만 이후 사건을 반영하지 못한 것 (문서 최종수정일과 사건 시점 비교).
  프로세스·가이드 문서에만 적용하고, 주기 문서(주간보고 등)는 최신 사건보다 뒤처지는 게 정상이므로 제외.
질문 원칙:
- observation은 데이터로 증명 가능한 사실만. question은 전임자가 5분 안에 답할 수 있는 구체적 질문.
- whyNeeded는 "후임자가 이걸 모르면 겪을 일"로 서술.
- 톤: observation·whyNeeded·question 모두 정중한 존댓말('~습니다/~합니다'체)로 끝맺는다. observation은 사실 서술이므로 "~있습니다/없습니다/남아 있지 않습니다"체, whyNeeded는 "~할 수 있습니다"체로 쓴다. 음슴체(명사형 종결 '~음/함/없음') 금지.
- 최대 5개, 확신 높은 순.
- 문서 목록이 비어 있으면 stale_doc 유형은 생략하고 나머지 유형만 생성.

${JSON_ONLY_RULE(QUESTION_TYPE_TEXT)}`;

export async function runStage3a(
  map: WorkMap,
  profile: Profile = DEMO_PROFILE,
  onToken?: (tokens: number) => void,
): Promise<RoadmapItem[]> {
  const out = await callLLM<{ items: RoadmapItem[] }>({
    system: buildSystem3A(profile),
    user: JSON.stringify(map, null, 1),
    schemaName: 'stage3a-roadmap',
    model: MODELS.stage2,
    maxTokens: 12000,
    onToken,
  });
  return out.items;
}

export async function runStage3b(
  map: WorkMap,
  docMeta: { title: string; lastModified: string }[],
  profile: Profile = DEMO_PROFILE,
  onToken?: (tokens: number) => void,
): Promise<Question[]> {
  const out = await callLLM<{ questions: Question[] }>({
    system: buildSystem3B(profile),
    user: `WorkMap: ${JSON.stringify(map, null, 1)}\n\n문서 목록(제목·최종수정일, 없으면 빈 배열): ${JSON.stringify(docMeta)}`,
    schemaName: 'stage3b-questions',
    model: MODELS.stage2,
    maxTokens: 8000,
    onToken,
  });
  return out.questions;
}
