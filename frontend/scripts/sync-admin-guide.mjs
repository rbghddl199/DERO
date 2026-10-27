// 에셋·발광 등록 가이드 정본(docs/context/admin-asset-registration.md)을 public/ 아래로 복사한다.
// public/ 경유인 이유: compose.yaml의 frontend 빌드 컨텍스트가 ./frontend라 Docker 빌드 중엔
// ../docs/를 아예 읽을 수 없다 — 빌드타임 import·fs 읽기가 불가능해 런타임 fetch로 간다.
// 그래서 원본이 없으면 실패가 아니라 조용히 성공 종료한다(커밋된 복사본이 이미 이미지에 들어 있다).
// 여기서 죽으면 prebuild 훅이 Docker 이미지 빌드를 통째로 깨뜨린다.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcPath = join(root, '..', 'docs', 'context', 'admin-asset-registration.md');
const outPath = join(root, 'public', 'docs', 'admin-asset-registration.md');

if (!existsSync(srcPath)) {
  console.log('[sync-admin-guide] docs 원본 없음 — 커밋된 복사본을 그대로 쓴다');
  process.exit(0);
}

mkdirSync(dirname(outPath), { recursive: true });
copyFileSync(srcPath, outPath);
console.log('[sync-admin-guide] public/docs/admin-asset-registration.md 갱신');
