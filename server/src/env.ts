import { existsSync } from 'node:fs';
import path from 'node:path';

// server/ 또는 repo 루트 어디서 실행돼도 루트 .env를 찾는다
for (const p of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
]) {
  if (existsSync(p)) {
    process.loadEnvFile(p);
    break;
  }
}
