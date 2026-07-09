import { callLLM, MODELS } from '../llm/adapter.js';
import { JSON_ONLY_RULE, WORK_MAP_TYPE_TEXT, type SourceFindings, type WorkMap } from './types.js';

const SYSTEM = `너는 5개 소스에서 추출된 findings를 하나의 '업무 지도'로 종합하는 인수인계 전문가다.
대상자: 김하늘 (플랫폼사업팀 대리, 퇴사일 2026-07-31). 오늘: 2026-07-06. 후임자: 이도현 사원(신입).
종합 원칙:
- 같은 업무·인물·사건이 여러 소스에 등장하면 하나로 병합하고 evidence를 합친다. (예: 다온테크 협상은 email+slack+jira 모두에 있음)
- duties의 cadence는 근거가 가장 구체적인 소스를 따른다.
- ongoing의 urgency는 오늘(2026-07-06)과 퇴사일(2026-07-31) 기준으로 판단하고 urgencyReason에 계산 근거를 쓴다.
  (예: "상대가 7/2 회신 요청, 4일 경과" / "마감 8/10, 인수인계 직후 도래")
- landmines에는 '후임자가 하면 안 되는 것(doNot)'을 행동 지침으로 쓴다.
- anomalies는 판단하지 말고 그대로 통과시켜라(stage3에서 처리). 단, 같은 사건의 중복 anomaly는 병합.
- id는 duties d1..., people p1..., ongoing o1..., landmines l1... 형식.

${JSON_ONLY_RULE(WORK_MAP_TYPE_TEXT)}`;

export async function runStage2(findings: SourceFindings[]): Promise<WorkMap> {
  return callLLM<WorkMap>({
    system: SYSTEM,
    user: JSON.stringify(findings, null, 1),
    schemaName: 'stage2-workmap',
    model: MODELS.stage2,
    maxTokens: 16000,
  });
}
