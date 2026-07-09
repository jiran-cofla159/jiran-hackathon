import { callLLM, MODELS } from '../llm/adapter.js';
import { DEMO_PROFILE, personLine, type Profile } from './profile.js';
import { JSON_ONLY_RULE, WORK_MAP_TYPE_TEXT, type SourceFindings, type WorkMap } from './types.js';

const buildSystem = (p: Profile) => `너는 5개 소스에서 추출된 findings를 하나의 '업무 지도'로 종합하는 인수인계 전문가다.
${personLine.stage2(p)}
종합 원칙:
- 같은 업무·인물·사건이 여러 소스에 등장하면 하나로 병합하고 evidence를 합친다. (예: 다온테크 협상은 email+slack+jira 모두에 있음)
- duties의 cadence는 근거가 가장 구체적인 소스를 따른다.
- ongoing의 urgency는 오늘(2026-07-06)과 퇴사일(2026-07-31) 기준으로 판단하고 urgencyReason에 계산 근거를 쓴다.
  (예: "상대가 7/2 회신 요청, 4일 경과" / "마감 8/10, 인수인계 직후 도래")
- landmines에는 '후임자가 하면 안 되는 것(doNot)'을 행동 지침으로 쓴다.
- person.inferredRole: 팀명·직함 같은 조직 정보는 입력에 존재하지 않는다고 가정하고, 활동 데이터에 나타난 실제 업무를
  요약한 '짧은 역할명 라벨'을 작성한다. 화면의 직함 자리에 표시되므로 20자 이내 명사구 한 개로 하고, 수식어구·나열을 금지한다
  (예: "파트너 계약·정산 관리 담당"). "~하는", "및", "과/와" 등으로 절을 잇는 긴 서술 금지 — 상세 업무는 duties에 담는다.
  추정을 뒷받침하는 인용을 inferredRoleEvidence에 넣는다.
- anomalies는 판단하지 말고 그대로 통과시켜라(stage3에서 처리). 단, 같은 사건의 중복 anomaly는 병합.
- id는 duties d1..., people p1..., ongoing o1..., landmines l1... 형식.

${JSON_ONLY_RULE(WORK_MAP_TYPE_TEXT)}`;

export async function runStage2(
  findings: SourceFindings[],
  profile: Profile = DEMO_PROFILE,
  onToken?: (tokens: number) => void,
): Promise<WorkMap> {
  const map = await callLLM<WorkMap>({
    system: buildSystem(profile),
    user: JSON.stringify(findings, null, 1),
    schemaName: 'stage2-workmap',
    model: MODELS.stage2,
    maxTokens: 16000,
    onToken,
  });
  // person 이름·퇴사일·팀은 LLM 추정이 아니라 사용자가 입력한 프로필을 신뢰한다 (inferredRole만 AI 추정 유지)
  map.person.name = profile.name;
  map.person.lastDay = profile.lastDay;
  map.person.team = profile.team;
  return map;
}
