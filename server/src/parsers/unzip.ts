import { inflateRawSync } from 'node:zlib';

// 최소 ZIP 리더 — Slack workspace export ZIP 해제용.
// 외부 의존성 없이 중앙 디렉터리를 읽어 stored(0)·deflate(8) 엔트리를 복원한다.
// (ZIP64·암호화는 미지원 — Slack 표준 export는 해당 없음)

export type ZipEntry = { name: string; data: Buffer };

const EOCD_SIG = 0x06054b50; // End of Central Directory
const CEN_SIG = 0x02014b50; // Central Directory File Header

export function unzip(buf: Buffer): ZipEntry[] {
  // EOCD는 파일 끝에서 최대 64KB 코멘트 뒤에 위치 — 뒤에서부터 스캔
  let eocd = -1;
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP: 올바른 ZIP 파일이 아닙니다 (EOCD 없음)');

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16); // 중앙 디렉터리 시작 오프셋
  const entries: ZipEntry[] = [];

  for (let n = 0; n < count; n++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== CEN_SIG) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20); // 중앙 디렉터리 기준 크기 (data descriptor 안전)
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);

    // 로컬 헤더에서 실제 데이터 시작 위치 계산 (name/extra 길이는 로컬 헤더 값 사용)
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    if (!name.endsWith('/')) {
      // 디렉터리 엔트리는 건너뜀
      let data: Buffer;
      if (method === 0) data = Buffer.from(raw);
      else if (method === 8) data = inflateRawSync(raw);
      else throw new Error(`ZIP: 지원하지 않는 압축 방식(${method}) — ${name}`);
      entries.push({ name, data });
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
