// 실제 이메일 export 파싱 — Gmail Takeout .mbox / 개별 .eml (RFC 822/2822 + MIME).
// 결과는 buildEmail이 기대하는 내부 형식 { mailbox, exported_at, emails[] }로 변환한다.
// (id는 데모 규약과 동일하게 순번 "m-001" — evidence ref 형식 일관성 유지)

export type EmailObj = {
  id: string;
  date: string; // ISO (원본 타임존 오프셋 보존)
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
};

export type EmailExport = { mailbox: string; exported_at: string; emails: EmailObj[] };

// ---- 문자셋 디코딩 ----

// WHATWG TextDecoder 라벨로 정규화 (한국어 레거시 라벨 보정)
function normalizeCharset(cs: string): string {
  const c = (cs || 'utf-8').trim().toLowerCase().replace(/["']/g, '');
  if (c.includes('ks_c_5601') || c.includes('ksc5601') || c === 'korean') return 'euc-kr';
  if (c === 'utf8') return 'utf-8';
  return c;
}

function decodeCharset(bytes: Buffer, charset: string): string {
  try {
    return new TextDecoder(normalizeCharset(charset)).decode(bytes);
  } catch {
    return bytes.toString('utf8');
  }
}

// ---- RFC 2047 인코딩 워드 (=?charset?B/Q?...?=) ----

function decodeWord(charset: string, enc: string, text: string): string {
  let bytes: Buffer;
  if (enc.toUpperCase() === 'B') {
    bytes = Buffer.from(text, 'base64');
  } else {
    const qp = text
      .replace(/_/g, ' ')
      .replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
    bytes = Buffer.from(qp, 'latin1');
  }
  return decodeCharset(bytes, charset);
}

// 헤더 값 디코드. 값은 latin1로 읽힌 상태 → 인코딩 워드는 charset대로,
// 나머지 리터럴 구간은 원본 UTF-8 바이트로 보고 재해석한다 (인코딩 안 된 UTF-8 헤더 대응).
function decodeWords(s: string): string {
  if (!s) return s;
  const literal = (run: string) => (run ? Buffer.from(run, 'latin1').toString('utf8') : '');
  // 인접한 인코딩 워드 사이 공백은 제거 (RFC 2047 규칙)
  const src = s.replace(/(\?=)\s+(=\?)/g, '$1$2');
  const WORD = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD.exec(src))) {
    out += literal(src.slice(last, m.index));
    out += decodeWord(m[1], m[2], m[3]);
    last = m.index + m[0].length;
  }
  out += literal(src.slice(last));
  return out;
}

// ---- 날짜 (RFC 2822 → ISO, 오프셋 보존) ----

function rfc822ToIso(raw: string): string {
  if (!raw) return '';
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return '';
  const m = raw.match(/([+-]\d{2})(\d{2})\s*$/);
  const p = (n: number) => String(n).padStart(2, '0');
  if (!m) return new Date(t).toISOString();
  const offMin = (m[1][0] === '-' ? -1 : 1) * (Number(m[1].slice(1)) * 60 + Number(m[2]));
  const local = new Date(t + offMin * 60000);
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  return (
    `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}` +
    `T${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}` +
    `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  );
}

// ---- 헤더 ----

function parseHeaders(headerText: string): Map<string, string> {
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, ' '); // 접힌 헤더 펼치기
  const map = new Map<string, string>();
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (!map.has(k)) map.set(k, v);
  }
  return map;
}

// ---- 본문 (MIME) ----

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// CTE(base64/quoted-printable) 디코드 후 문자셋 적용
function decodeBody(bodyLatin1: string, cte: string, charset: string): string {
  const enc = (cte || '').toLowerCase();
  let bytes: Buffer;
  if (enc.includes('base64')) {
    bytes = Buffer.from(bodyLatin1.replace(/\s+/g, ''), 'base64');
  } else if (enc.includes('quoted-printable')) {
    const qp = bodyLatin1
      .replace(/=\r?\n/g, '') // soft line break
      .replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
    bytes = Buffer.from(qp, 'latin1');
  } else {
    bytes = Buffer.from(bodyLatin1, 'latin1');
  }
  return decodeCharset(bytes, charset);
}

function splitParts(body: string, boundary: string): string[] {
  const segs = body.split('--' + boundary);
  // [프리앰블, part1, ..., 마지막("--"로 시작하는 종료 마커+에필로그)]
  return segs
    .slice(1)
    .filter((s) => !/^--/.test(s))
    .map((s) => s.replace(/^\r?\n/, ''));
}

// 헤더+본문에서 사람이 읽을 텍스트 추출 (multipart는 text/plain 우선, 없으면 html strip)
function extractBody(headers: Map<string, string>, bodyLatin1: string): string {
  const ct = headers.get('content-type') || 'text/plain';
  const cte = headers.get('content-transfer-encoding') || '';
  const boundary = ct.match(/boundary="?([^";]+)"?/i)?.[1];

  if (/multipart\//i.test(ct) && boundary) {
    const parsed = splitParts(bodyLatin1, boundary).map((p) => {
      const idx = p.search(/\r?\n\r?\n/);
      const ph = idx >= 0 ? parseHeaders(p.slice(0, idx)) : new Map<string, string>();
      const pb = idx >= 0 ? p.slice(idx).replace(/^\r?\n\r?\n/, '') : p;
      return { headers: ph, body: pb, ct: ph.get('content-type') || 'text/plain' };
    });
    const plain = parsed.find((p) => /text\/plain/i.test(p.ct));
    if (plain) return extractBody(plain.headers, plain.body);
    const nested = parsed.find((p) => /multipart\//i.test(p.ct));
    if (nested) return extractBody(nested.headers, nested.body);
    const html = parsed.find((p) => /text\/html/i.test(p.ct));
    if (html) return stripHtml(extractBody(html.headers, html.body));
    return parsed.length ? extractBody(parsed[0].headers, parsed[0].body) : '';
  }

  const charset = ct.match(/charset="?([^";]+)"?/i)?.[1] || 'utf-8';
  const text = decodeBody(bodyLatin1, cte, charset);
  return /text\/html/i.test(ct) ? stripHtml(text) : text.trim();
}

// ---- 주소 ----

function splitAddrs(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const addrOf = (s: string) => s.match(/<([^>]+)>/)?.[1] ?? s.trim();

// ---- 단일 메시지 ----

function parseMessage(rawLatin1: string, index: number): EmailObj | null {
  const idx = rawLatin1.search(/\r?\n\r?\n/);
  const headerText = idx >= 0 ? rawLatin1.slice(0, idx) : rawLatin1;
  const body = idx >= 0 ? rawLatin1.slice(idx).replace(/^\r?\n\r?\n/, '') : '';
  const h = parseHeaders(headerText);

  const from = decodeWords(h.get('from') || '');
  const subjectRaw = h.get('subject');
  if (!from && !subjectRaw) return null; // 빈 청크·구분선 방지

  const email: EmailObj = {
    id: `m-${String(index + 1).padStart(3, '0')}`,
    date: rfc822ToIso(h.get('date') || ''),
    from,
    to: splitAddrs(decodeWords(h.get('to') || '')),
    subject: decodeWords(subjectRaw || '(제목 없음)'),
    body: extractBody(h, body).trim(),
  };
  const cc = splitAddrs(decodeWords(h.get('cc') || ''));
  if (cc.length) email.cc = cc;
  return email;
}

// 소유자 메일함 추정 — 수신자로 가장 자주 등장하는 주소
function guessMailbox(emails: EmailObj[]): string {
  const freq = new Map<string, number>();
  for (const e of emails) for (const t of e.to) {
    const a = addrOf(t);
    freq.set(a, (freq.get(a) ?? 0) + 1);
  }
  let best = '';
  let max = 0;
  for (const [a, n] of freq) if (n > max) ((max = n), (best = a));
  return best || '(알 수 없음)';
}

// ---- 공개 API ----

export function parseMbox(buf: Buffer): EmailExport {
  const raw = buf.toString('latin1'); // 구조 스캔은 바이트 보존, payload는 파트별로 디코드
  const chunks = raw.split(/\r?\n(?=From )/); // mbox "From " 구분선
  const emails = chunks
    .map((c, i) => {
      const cleaned = c
        .replace(/^From .*\r?\n/, '') // 구분선 제거
        .replace(/^>(>*From )/gm, '$1'); // mboxrd ">From" 언이스케이프
      return parseMessage(cleaned, i);
    })
    .filter((e): e is EmailObj => e !== null)
    .map((e, i) => ({ ...e, id: `m-${String(i + 1).padStart(3, '0')}` })); // 유효 메시지 기준 재번호
  return { mailbox: guessMailbox(emails), exported_at: new Date().toISOString(), emails };
}

// 개별 .eml 1건 — 세션 누적을 위해 단일 이메일 객체 반환
export function parseEml(buf: Buffer): EmailObj | null {
  return parseMessage(buf.toString('latin1'), 0);
}
