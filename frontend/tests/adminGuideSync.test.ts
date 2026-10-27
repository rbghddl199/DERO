// public/docs 복사본이 docs 정본과 어긋나면(sync 스크립트를 안 돌린 커밋) 모달이 옛 문서를 띄운다.
// Docker 빌드 컨텍스트엔 docs/가 없으므로(scripts/sync-admin-guide.mjs) 정본이 없으면 스킵한다.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourcePath = join(root, '..', 'docs', 'context', 'admin-asset-registration.md');
const copyPath = join(root, 'public', 'docs', 'admin-asset-registration.md');

describe('관리자 등록 가이드 문서 동기화', () => {
  it.skipIf(!existsSync(sourcePath))('public 복사본이 docs 정본과 바이트 동일하다', () => {
    expect(readFileSync(copyPath)).toEqual(readFileSync(sourcePath));
  });
});
