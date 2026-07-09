import { useRef, useState } from 'react';
import { Badge, Card } from '../ui';
import type { JobStatus } from '../api';

export type ConnectorKey = 'slack' | 'email' | 'jira' | 'officenote';

export const CONNECTORS: {
  key: ConnectorKey;
  icon: string;
  name: string;
  desc: string;
  match: RegExp;
}[] = [
  { key: 'slack', icon: '💬', name: 'Slack', desc: '채널 · DM 내보내기', match: /slack/i },
  { key: 'email', icon: '✉️', name: '이메일', desc: '메일함 내보내기 (.eml/.mbox)', match: /mail|\.eml$|\.mbox$/i },
  { key: 'jira', icon: '🎫', name: 'Jira', desc: '이슈 · 댓글 내보내기', match: /jira/i },
  { key: 'officenote', icon: '📝', name: '오피스노트', desc: '문서 · 주간보고', match: /note|보고|report|doc/i },
];

const PLANNED = [
  { icon: '🔗', name: 'OAuth 실시간 연동', desc: '계정 연결로 자동 수집' },
  { icon: '🐙', name: 'GitHub', desc: 'PR · 이슈 · 리뷰' },
  { icon: '💭', name: '오피스챗', desc: '팀 룸 · DM' },
];

// 파일명으로 커넥터 추론 — 서버 /api/upload가 sources를 안 내려줄 때의 폴백이기도 함
export function inferSource(filename: string): ConnectorKey {
  return CONNECTORS.find((c) => c.match.test(filename))?.key ?? 'officenote';
}

const STAGES: { key: string; label: string }[] = [
  { key: 'parse', label: '연동 소스 데이터 수집' },
  { key: 'stage1', label: '소스별 업무 단서 추출' },
  { key: 'stage2', label: '지식 종합 — 업무 지도 구성' },
  { key: 'stage3', label: '온보딩 로드맵 설계 · 기록되지 않은 지식 탐지' },
];

export function ConnectScreen({
  connected,
  onFiles,
  job,
  onStart,
}: {
  connected: Partial<Record<ConnectorKey, string[]>>;
  onFiles: (files: File[]) => void;
  job: JobStatus | null;
  onStart: () => void;
}) {
  const running = job?.status === 'running';
  const stageIdx = STAGES.findIndex((s) => s.key === job?.stage);
  const connectedCount = Object.keys(connected).length;
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (list: FileList | null) => {
    if (list?.length) onFiles(Array.from(list));
  };

  return (
    <div className="relative space-y-6">
      <Card className="flex items-center justify-between !p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-700">
            김
          </span>
          <div>
            <div className="text-lg font-semibold">
              김하늘 대리 <span className="ml-1 text-sm font-normal text-neutral-500">플랫폼사업팀</span>
            </div>
            <div className="text-sm text-neutral-500">파트너사 계약·정산 담당 · 2021년 입사</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="red">퇴사 D-22 · 2026-07-31</Badge>
          <button
            onClick={onStart}
            disabled={running || connectedCount === 0}
            className="cursor-pointer rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? '분석 중…' : connectedCount === 0 ? '데이터를 먼저 연동하세요' : '분석 시작'}
          </button>
        </div>
      </Card>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-12 transition ${
          dragging
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-neutral-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="text-4xl">📂</div>
        <div className="mt-3 text-base font-semibold">
          내보내기 파일을 여기에 끌어다 놓으세요
        </div>
        <div className="mt-1 text-sm text-neutral-500">
          Slack · 이메일 · Jira · 오피스노트 내보내기 파일 — 올릴 때마다 아래 커넥터에 불이 들어옵니다
        </div>
        <div className="mt-3 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-500">
          또는 클릭해서 파일 선택
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-neutral-500">
          연동 소스 <span className="font-normal text-neutral-400">— {connectedCount}/{CONNECTORS.length} 연동됨</span>
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {CONNECTORS.map((c) => {
            const files = connected[c.key];
            const on = !!files?.length;
            return (
              <Card
                key={c.key}
                className={`!p-4 transition ${on ? 'border-emerald-300 ring-1 ring-emerald-200' : 'opacity-70'}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className={`text-2xl ${on ? '' : 'grayscale'}`}>{c.icon}</span>
                  {on ? <Badge tone="green">✓ 연동됨</Badge> : <Badge>대기</Badge>}
                </div>
                <div className={`font-semibold ${on ? '' : 'text-neutral-500'}`}>{c.name}</div>
                <div className="truncate text-xs text-neutral-500">
                  {on ? files!.join(', ') : c.desc}
                </div>
              </Card>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-3">
          {PLANNED.map((c) => (
            <Card key={c.name} className="!p-4 opacity-45">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl grayscale">{c.icon}</span>
                <Badge>지원 예정</Badge>
              </div>
              <div className="font-semibold text-neutral-500">{c.name}</div>
              <div className="text-xs text-neutral-400">{c.desc}</div>
            </Card>
          ))}
        </div>
      </div>

      {running && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm">
          <Card className="w-[480px] !p-8">
            <h3 className="mb-1 text-lg font-semibold">김하늘 대리의 업무 지식을 분석하고 있습니다</h3>
            <p className="mb-6 text-sm text-neutral-500">기록된 적 없는 지식까지 찾아냅니다.</p>
            <ul className="space-y-4">
              {STAGES.map((s, i) => (
                <li key={s.key} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      i < stageIdx
                        ? 'bg-emerald-100 text-emerald-700'
                        : i === stageIdx
                          ? 'bg-indigo-600 text-white'
                          : 'bg-neutral-100 text-neutral-400'
                    }`}
                  >
                    {i < stageIdx ? '✓' : i === stageIdx ? <Spinner /> : i + 1}
                  </span>
                  <div>
                    <div className={`text-sm font-medium ${i <= stageIdx ? 'text-neutral-900' : 'text-neutral-400'}`}>
                      {s.label}
                    </div>
                    {i === stageIdx && (
                      <div className="mt-0.5 text-xs text-indigo-600">{job?.stageDetail}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {job?.status === 'error' && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">분석 실패: {job.error}</Card>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}
