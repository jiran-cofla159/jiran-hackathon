import { callLLM, MODELS } from './llm/adapter.js';

// 완료 기준(§6): adapter로 "hello" JSON 응답 수신
const system = '너는 JSON만 출력하는 어시스턴트다. 설명 문장 금지.';
const user = '{"greeting": string, "model_family": string} 형태의 JSON을 출력해. greeting은 "hello", model_family는 네가 어떤 모델인지.';

for (const [stage, model] of Object.entries(MODELS)) {
  const out = await callLLM<{ greeting: string }>({
    system,
    user,
    schemaName: `smoke-${stage}`,
    model,
    maxTokens: 200,
    cache: false,
  });
  console.log(`✅ ${stage} (${model}):`, JSON.stringify(out));
  if (out.greeting?.toLowerCase() !== 'hello') throw new Error(`greeting 불일치: ${JSON.stringify(out)}`);
}
console.log('\n스모크 테스트 통과 — adapter 준비 완료');
