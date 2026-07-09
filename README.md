# 이음 — AI 인수인계 (지란지교 해커톤 2026)

퇴사자의 활동 데이터(메일·Slack·Jira·오피스노트·오피스챗)에서 기록된 적 없는 업무 지식을 꺼내
후임자의 온보딩 지도로 만든다. 설계: `~/Documents/officenote/hackathon2026-plan/DESIGN.md`

## 실행

```bash
pnpm install
pnpm dev:server   # Express :3001 (LLM 파이프라인)
pnpm dev:web      # Vite :5173 (/api 프록시)
```

`.env` (루트, gitignore됨):

```
AI_API_KEY=sk-...   # 게이트웨이 키 (LLM_API_KEY도 인식)
```

## 구조

- `server/src/llm/adapter.ts` — OpenAI 호환 chat/completions (게이트웨이가 Anthropic /v1/messages 미지원 — 7/9 확인). temperature 0, JSON 파싱 실패 시 1회 재시도, `cache/`에 입력 해시 기반 스테이지 캐시.
- `server/src/parsers/` — 목데이터 5소스 → ref 규약 텍스트 청크
- `server/src/pipeline/` — stage1 추출(Sonnet ×5 병렬) → stage2 WorkMap(Opus) → stage3a 로드맵 + 3b 역질문(Opus)
- `web/` — React + Tailwind, 4화면 (연동 → 업무 지도 → 로드맵 → 인터뷰)

## 파이프라인 단독 실행 (프롬프트 튜닝 루프)

```bash
cd server
pnpm exec tsx src/pipeline/run-stage1.ts   # → out/stage1.json
pnpm exec tsx src/pipeline/run-stage2.ts   # → out/workmap.json
pnpm exec tsx src/pipeline/run-stage3.ts   # → out/roadmap.json, out/questions.json
```

같은 입력이면 `cache/` 히트로 LLM 호출 생략. 특정 스테이지만 다시 돌리려면 해당 캐시 파일 삭제.

- 데모 오버레이 속도: `DEMO_PACE_MS` (기본 1800, 0이면 끔)
- 실측 소요(캐시 미스): stage1 ~45s · stage2 ~3분 · stage3 ~1.5분 — 라이브 데모는 캐시 필수
