// 재현 루프(진단용) — 수정 화면에서 태그된 사진을 지우고 새 사진을 올려 태그를 걸면
// 제품 태그 PUT이 **새 사진 id**로 나가야 한다. 위쪽 사진 id로 나가면 이 스펙이 빨간불이다.
// 백엔드 없이 page.route 스텁만으로 돈다(ADR-0016 결정 5).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { stubAuthenticatedSession, stubPlacementList } from './helpers/auth';

const FEED_ID = 777;
const IMAGE_A = { id: 1, imageKey: 'feed/777/a', imageUrl: 'http://localhost:3000/e2e-img/a.png' };
const IMAGE_B = { id: 2, imageKey: 'feed/777/b', imageUrl: 'http://localhost:3000/e2e-img/b.png' };
const IMAGE_C = { id: 3, imageKey: 'feed/777/c', imageUrl: 'http://localhost:3000/e2e-img/c.png' };
const OLD_PRODUCT = { id: 77, name: '기존 태그 제품', priceKrw: 50000, imageUrl: null };
const NEW_PRODUCT_ID = 88;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function detailBody(images: { id: number; imageKey: string; imageUrl: string }[]): string {
  return JSON.stringify({
    id: FEED_ID,
    title: '태그 사진 재현',
    content: images.map((image) => `![사진](${image.imageKey})`).join('\n\n'),
    mentions: [],
    hashtags: [],
    images: images.map((image) => ({
      ...image,
      // B(아래 사진)만 기존 제품이 태그돼 있다 — 재현 절차의 출발 상태.
      productIds: image.id === IMAGE_B.id ? [OLD_PRODUCT.id] : [],
    })),
    likeCount: 0,
    commentCount: 0,
    placementId: null,
    placement: null,
    usedProducts: [OLD_PRODUCT],
    authorId: 1,
    nickname: 'E2E 사용자',
    profileImageKey: null,
    createdAt: '2026-08-12T00:00:00Z',
    updatedAt: null,
  });
}

/** 제품 태그 PUT 캡처 — {imageId, productIds} 순서대로 쌓인다. */
type ProductPut = { imageId: number; productIds: number[] };

async function stubDeskFeedEdit(page: Page): Promise<ProductPut[]> {
  const productPuts: ProductPut[] = [];

  // 넓은 패턴을 먼저 등록한다 — Playwright는 나중 등록이 이긴다.
  await page.route('**/e2e-img/**', (route) => {
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 });
  });
  await page.route('**/e2e-upload/**', (route) => route.fulfill({ status: 200 }));
  await stubPlacementList(page);

  await page.route(`**/api/v1/desk-feeds/${FEED_ID}`, (route) => {
    // GET(로드)·PUT(본문 저장) 모두 상세를 돌려준다 — 폼은 응답 내용을 안 읽는다.
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: detailBody([IMAGE_A, IMAGE_B]),
    });
  });
  await page.route(`**/api/v1/desk-feeds/${FEED_ID}/like`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ liked: false, likeCount: 0 }),
    });
  });
  await page.route(`**/api/v1/desk-feeds/${FEED_ID}/comments**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [], nextCursor: null, hasNext: false, totalCount: 0 }),
    });
  });
  await page.route(`**/api/v1/desk-feeds/${FEED_ID}/images/**`, (route) => {
    // DELETE .../images/{id} — 사진 삭제.
    route.fulfill({ status: 204 });
  });
  await page.route(`**/api/v1/desk-feeds/${FEED_ID}/images/*/products`, (route) => {
    const url = new URL(route.request().url());
    const imageId = Number(url.pathname.split('/images/')[1]!.split('/')[0]);
    const { productIds } = route.request().postDataJSON() as { productIds: number[] };
    productPuts.push({ imageId, productIds });
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...IMAGE_C, productIds }),
    });
  });
  await page.route(`**/api/v1/desk-feeds/${FEED_ID}/images/upload-urls`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{ imageKey: IMAGE_C.imageKey, uploadUrl: 'http://localhost:3000/e2e-upload/c' }],
      }),
    });
  });
  await page.route(`**/api/v1/desk-feeds/${FEED_ID}/images`, (route) => {
    // POST 등록 — 새 사진 C.
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...IMAGE_C, productIds: [] }),
    });
  });
  await page.route('**/api/v1/products?**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        content: [{ id: NEW_PRODUCT_ID, name: '새로 붙일 제품', priceKrw: 129000, images: [] }],
        nextCursor: null,
        hasNext: false,
      }),
    });
  });

  return productPuts;
}

test('태그된 사진 삭제 후 새 사진에 건 제품 태그는 새 사진 id로 저장된다', async ({ page }) => {
  await stubAuthenticatedSession(page);
  const productPuts = await stubDeskFeedEdit(page);
  page.on('dialog', (dialog) => void dialog.accept());

  await page.goto(`/desk-feed/${FEED_ID}/edit`);

  const editor = page.locator('.post-rich-editor-content');
  await expect(editor.locator(`img[src="${IMAGE_A.imageUrl}"]`)).toBeVisible();
  await expect(editor.locator(`img[src="${IMAGE_B.imageUrl}"]`)).toBeVisible();

  // ① 태그된 사진 B(두 번째)를 썸네일 줄에서 지운다.
  await page.getByRole('button', { name: '사진 2 삭제' }).click();
  await expect(editor.locator(`img[src="${IMAGE_B.imageUrl}"]`)).toHaveCount(0);

  // 삭제(본문 전체 교체) 직후에도 패널이 저절로 열리면 안 된다 — 열려 있으면 교체가 옮겨 놓은
  // 선택이 이미지에 떨어진 것이고, 거기 태그하면 엉뚱한 사진에 붙는다(아래 ②와 같은 뿌리).
  const panel = page.locator('div:has(> span:text("이 사진에 찍힌 제품"))');
  await expect(panel).toBeHidden();

  // ② 새 사진 C를 상단 업로드 존으로 올린다.
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: 'new-photo.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  const imageC = editor.locator(`img[src="${IMAGE_C.imageUrl}"]`);
  await expect(imageC).toBeVisible();

  // 사용자는 아직 아무 사진도 고르지 않았다 — 패널이 저절로 열려 있으면 그 패널은 위쪽 사진(A)을
  // 물고 있는 것이고, 거기 태그하면 위 사진에 붙는다(사용자 증상). 여기서 빨간불이 나야 한다.
  await expect(panel).toBeHidden();

  // ③ 본문에서 C를 골라 제품 태그 패널을 열고 제품을 붙인다.
  await imageC.click();
  await expect(panel).toBeVisible();
  await panel.locator('input[type="search"]').fill('새로');
  await panel.getByRole('button', { name: /새로 붙일 제품/ }).click();
  await expect(panel.getByText('새로 붙일 제품').first()).toBeVisible();

  // ④ 저장 — 제품 태그 PUT이 새 사진 C(id=3)로 나가야 한다.
  await page.getByRole('button', { name: '저장하기' }).click();
  await expect.poll(() => productPuts.length, { timeout: 10_000 }).toBeGreaterThan(0);

  // 사용자 증상: 위쪽 사진(A)이나 지운 사진(B)에 태그가 붙는다 — 그러면 여기서 빨간불.
  expect(productPuts).toEqual([{ imageId: IMAGE_C.id, productIds: [NEW_PRODUCT_ID] }]);
});
