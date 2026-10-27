import { test, expect } from '@playwright/test';
import { stubAuthenticatedSession } from './helpers/auth';
import { seedCoachTourSeen } from './helpers/tour';

// 모니터 화면 사용자 사진 — 2026-08-03 추가. 사진은 서버로 안 나가고 브라우저
// IndexedDB에만 남는다(백엔드 컬럼 없음). 여기서는 상태 전이와 노출 조건만 본다 —
// 렌더 룩 판정은 휴먼인더루프이고, sampleRegion은 순차 스위트 후반에서 SwiftShader
// 타임아웃이 알려져 있다(e2e/CLAUDE.md).
//
// 캔버스 실드래그는 안 쓴다 — 배치는 __sim 훅, 조작은 HUD로 한다.

/** 1×1 빨강 PNG — 내용이 아니라 "파일이 들어갔는가"만 보므로 최소 크기면 된다. */
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await stubAuthenticatedSession(page);
  await seedCoachTourSeen(page);
});

async function enterEmptySim(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/simulator');
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
  await page.evaluate(() => window.__sim.enterSim('desk-oak-1200'));
  await page.evaluate(() => window.__sim.reset());
  await page.waitForTimeout(200);
}

async function placeAndSelect(
  page: import('@playwright/test').Page,
  specId: string,
): Promise<string> {
  const id = (await page.evaluate(
    (s) => window.__sim.placeProductAt(s, 0, 0)!.id,
    specId,
  )) as string;
  await page.evaluate((pid) => window.__sim.selectItem(pid), id);
  return id;
}

test('화면 사진 행은 모니터에만 뜬다', async ({ page }) => {
  await enterEmptySim(page);

  await placeAndSelect(page, 'monitor-27');
  await expect(page.getByTestId('screen-photo-row')).toBeVisible();

  // 화면 메쉬가 없는 제품은 행 자체가 없다 — 발광 스위치와 같은 노출 규약.
  await page.evaluate(() => window.__sim.reset());
  await placeAndSelect(page, 'mug-ceramic');
  await expect(page.getByTestId('screen-photo-row')).toHaveCount(0);
});

test('사진을 올리면 화면에 붙고 제거하면 기본 화면으로 돌아온다', async ({ page }) => {
  await enterEmptySim(page);
  await placeAndSelect(page, 'monitor-27');

  const pick = page.getByTestId('screen-photo-input');
  await expect(page.getByTestId('screen-photo-clear')).toHaveCount(0);

  await pick.setInputFiles({ name: 'wallpaper.png', mimeType: 'image/png', buffer: RED_PNG });
  // 다운스케일·디코드가 비동기라 버튼 라벨이 바뀌는 것으로 적용 완료를 기다린다.
  await expect(page.getByTestId('screen-photo-clear')).toBeVisible();
  await expect(page.getByTestId('screen-photo-row')).toContainText('변경');

  await page.getByTestId('screen-photo-clear').click();
  await expect(page.getByTestId('screen-photo-clear')).toHaveCount(0);
  await expect(page.getByTestId('screen-photo-row')).toContainText('사진 올리기');
});

test('곡면 모니터도 같은 경로를 탄다', async ({ page }) => {
  await enterEmptySim(page);
  await placeAndSelect(page, 'monitor-34-curved');

  await page
    .getByTestId('screen-photo-input')
    .setInputFiles({ name: 'wallpaper.png', mimeType: 'image/png', buffer: RED_PNG });
  await expect(page.getByTestId('screen-photo-clear')).toBeVisible();
});
