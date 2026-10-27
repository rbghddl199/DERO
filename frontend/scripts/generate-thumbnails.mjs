// 라이브러리 갤러리 카드용 정적 썸네일 PNG 일괄 생성 — /simulator 갤러리 DOM에서 대상 id·kind 목록을
// 그대로 읽어(정본 이중 관리 없음) /simulator/thumbnail-render를 순회 방문해 캡처한다.
// 사전조건: `npm run dev`(또는 THUMBNAIL_BASE_URL로 지정한 서버)가 떠 있어야 한다.
// headless:false 필수 — 헤드리스 page.screenshot은 SwiftShader 리드백에서 멈추는 전례 있음(e2e/CLAUDE.md).
// GPU 없는 headed 환경(예: CI 컨테이너)에서는 playwright.config.ts와 같은 SwiftShader 인자가
// 없으면 알파 채널이 통째로 빠져(RGB, 불투명 검정 배경) 캡처된다 — omitBackground가 무력화된다.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SWIFTSHADER_ARGS = [
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--ignore-gpu-blocklist',
];

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'public', 'assets', 'thumbnails');
const baseURL = process.env.THUMBNAIL_BASE_URL ?? 'http://localhost:3000';

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: false, args: SWIFTSHADER_ARGS });
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });

await page.goto(`${baseURL}/simulator`);
await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
await page.evaluate(() => window.__sim.enterSim('desk-oak-1200'));
await page.waitForTimeout(300);

const items = await page.evaluate(() => {
  const collect = (prefix, kind) =>
    [...document.querySelectorAll(`[data-testid^="${prefix}-"]`)].map((el) => ({
      id: el.getAttribute('data-testid').slice(prefix.length + 1),
      kind,
    }));
  return collect('lib-card', 'local');
});

// 책상(kind='surface')은 라이브러리 갤러리가 아니라 /craft/new 책상 선택 카드에서 목록을
// 읽는다 — '직접 입력' 카드(craft-desk-card-custom)는 미리 정의된 제품이 아니라 제외한다.
await page.goto(`${baseURL}/craft/new`);
const deskItems = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="craft-desk-card-"]')]
    .map((el) => el.getAttribute('data-testid').slice('craft-desk-card-'.length))
    .filter((id) => id !== 'custom')
    .map((id) => ({ id, kind: 'desk' })),
);
items.push(...deskItems);

console.log(`[generate-thumbnails] ${items.length} items found`);

for (const { id, kind } of items) {
  const url = `${baseURL}/simulator/thumbnail-render?id=${encodeURIComponent(id)}&kind=${kind}`;
  await page.goto(url);
  await page.waitForFunction(
    () => document.querySelector('[data-testid="thumbnail-canvas"]')?.dataset.thumbReady === '1',
    null,
    { timeout: 20_000 },
  );
  const outPath = join(outDir, `${id}.png`);
  await page.getByTestId('thumbnail-canvas').screenshot({ path: outPath, omitBackground: true });
  console.log(`[generate-thumbnails] ${id} -> ${outPath}`);
}

await browser.close();
