// GLB 라이브러리(assets-raw/library) 일괄 압축 -> public/assets/models. 네이티브 gltfpack 필수(assets-raw/CLAUDE.md).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'assets-raw', 'library');
const outDir = join(root, 'public', 'assets', 'models');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// "001-Y-ytb-0001.glb" -> "glb-0001.glb" (원본 접두사 대신 안정 id, 4자리 번호 보존)
function slugFor(file) {
  const m = basename(file).match(/(\d{4})\.glb$/);
  if (!m) throw new Error(`[build-library-assets] unexpected filename: ${file}`);
  return `glb-${m[1]}.glb`;
}

const files = readdirSync(srcDir).filter((f) => f.endsWith('.glb'));
for (const file of files) {
  const inPath = join(srcDir, file);
  const outPath = join(outDir, slugFor(file));
  console.log(`[build-library-assets] ${file} -> ${basename(outPath)}`);
  execFileSync(
    'gltfpack',
    ['-cc', '-tc', '-tl', '1024', '-si', '0.5', '-i', inPath, '-o', outPath],
    { stdio: 'inherit' },
  );
}
