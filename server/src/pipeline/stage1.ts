import { callLLM, MODELS } from '../llm/adapter.js';
import type { ParsedSource } from '../parsers/index.js';
import { JSON_ONLY_RULE, SOURCE_FINDINGS_TYPE_TEXT, type SourceFindings } from './types.js';

const SYSTEM = `너는 퇴사 예정자의 업무 활동 데이터를 분석해 인수인계에 필요한 지식을 추출하는 분석가다.
분석 대상자: 김하늘 (플랫폼사업팀 대리, 2026-07-31 퇴사 예정). 오늘: 2026-07-06.
추출 원칙:
- 반복 패턴(요일·날짜·주기 언급)은 duties로.
- 사람 이름이 나오면 people로 — 소속, 대상자와의 관계, 커뮤니케이션 팁(연락 방법 선호 등)까지.
- 진행 중이며 완결되지 않은 일은 ongoing으로 — 다음 액션과 기한을 반드시 추정.
- 과거 실패·반려·홀딩된 일과 그 사유는 landmines로.
- 활동량이 비정상적으로 몰리거나, 결론이 기록 없이 끝난 흔적(예: "유선으로 처리")은 anomalies로.
- 잡담·뉴스레터 등 업무 무관 내용은 무시.
- 모든 항목에 evidence(원문 인용) 필수. 인용 없는 추측 금지.

${JSON_ONLY_RULE(SOURCE_FINDINGS_TYPE_TEXT)}`;

export async function runStage1(
  parsed: ParsedSource[],
  onProgress?: (detail: string) => void,
): Promise<SourceFindings[]> {
  return Promise.all(
    parsed.map(async (p) => {
      onProgress?.(`${p.stats} 분석 중…`);
      const out = await callLLM<SourceFindings>({
        system: SYSTEM,
        user: `소스: ${p.source}. 아래는 ${p.source} export 원문이다.\n\n${p.text}`,
        schemaName: `stage1-${p.source}`,
        model: MODELS.stage1,
      });
      out.source = p.source;
      return out;
    }),
  );
}
