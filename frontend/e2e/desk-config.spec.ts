import { test, expect } from '@playwright/test'
import { stubAuthenticatedSession } from './helpers/auth'
import { seedCoachTourSeen } from './helpers/tour'

// /simulator는 로그인 진입 관문 뒤다(결정 8 / D14) — 세션 스텁 없이 goto하면 /login으로
// 튕겨 씬이 뜨지 않는다. Playwright에 백엔드를 붙이지 않으므로(ADR-0016 결정 5) 프론트가
// 실제로 부르는 인증 엔드포인트만 네트워크 레벨로 막는다.
test.beforeEach(async ({ page }) => {
  await stubAuthenticatedSession(page)
  await seedCoachTourSeen(page)
})

test.beforeEach(async ({ page }) => {
  await page.goto('/simulator')
  await page.waitForFunction(() => !!window.__sim, null, { timeout: 30_000 })
})

test('제품 모드: 제품을 고르면 DB 규격이 그대로 반영된다', async ({ page }) => {
  await page.evaluate(() => window.__sim.enterSim('desk-walnut-1400'))
  const info = await page.evaluate(() => window.__sim.deskInfo())
  expect(info.source).toBe('product')
  expect(info.widthMm).toBe(1400)
  expect(info.depthMm).toBe(700)
  expect(info.heightMm).toBe(745)
  expect(info.topThicknessMm).toBe(30)
  expect(info.surfaceTopY).toBeCloseTo(0.745, 4)
})

test('직접 입력 모드: 입력 규격으로 책상이 생성된다', async ({ page }) => {
  await page.evaluate(() =>
    window.__sim.setDeskConfig({
      source: 'custom',
      widthMm: 1800,
      depthMm: 800,
      heightMm: 900,
      topThicknessMm: 40,
      materialId: 'black',
      frameType: 't-frame',
    }),
  )
  const info = await page.evaluate(() => window.__sim.deskInfo())
  expect(info.source).toBe('custom')
  expect(info.widthMm).toBe(1800)
  expect(info.surfaceTopY).toBeCloseTo(0.9, 4)
  expect(info.materialId).toBe('black')
  expect(info.frameType).toBe('t-frame')
})

test('전면 벽이 책상 뒷변에 밀착한다 (설계 §2.3)', async ({ page }) => {
  await page.evaluate(() => window.__sim.enterSim('desk-walnut-1400'))
  const a = await page.evaluate(() => window.__sim.deskInfo())
  // desk-walnut-1400 깊이 700 -> 뒷변 z = -0.35, 벽은 기본 간격 50mm 뒤(2026-08-06 1mm→50mm)
  expect(a.frontWallZ).toBeCloseTo(-0.4, 4)

  await page.evaluate(() =>
    window.__sim.setDeskConfig({
      source: 'custom',
      widthMm: 1400,
      depthMm: 1000,
      heightMm: 740,
      topThicknessMm: 25,
      materialId: 'oak',
      frameType: 'four-leg',
    }),
  )
  const b = await page.evaluate(() => window.__sim.deskInfo())
  expect(b.frontWallZ).toBeCloseTo(-0.55, 4)
})

test('책상 GLB 네트워크 요청이 없다 (설계 수용기준 3)', async ({ page }) => {
  const glbRequests: string[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('.glb')) glbRequests.push(r.url())
  })
  await page.evaluate(() => window.__sim.enterSim('desk-oak-1200'))
  await page.evaluate(() =>
    window.__sim.setDeskConfig({
      source: 'custom',
      widthMm: 900,
      depthMm: 500,
      heightMm: 700,
      topThicknessMm: 18,
      materialId: 'white',
      frameType: 'top-only',
    }),
  )
  await page.waitForLoadState('networkidle')
  expect(glbRequests).toEqual([])
})

test('좁아진 상판 밖 소품은 저장을 막는다 (수용기준 6)', async ({ page }) => {
  await page.evaluate(() => window.__sim.enterSim('desk-oak-1200'))
  // desk-oak-1200 상판 halfW=0.6 halfD=0.3 — x=0.5는 안쪽
  await page.evaluate(() => window.__sim.placeProductAt('bottle-steel', 0.5, 0))
  expect(await page.evaluate(() => window.__sim.trySave().ok)).toBe(true)

  // 폭 700(halfW=0.35)으로 줄이면 x=0.5는 상판 밖.
  // setDesk는 배치를 비우므로(clearPlaced) 같은 좌표에 다시 놓아 확인한다.
  await page.evaluate(() =>
    window.__sim.setDeskConfig({
      source: 'custom',
      widthMm: 700,
      depthMm: 600,
      heightMm: 740,
      topThicknessMm: 25,
      materialId: 'oak',
      frameType: 'four-leg',
    }),
  )
  await page.evaluate(() => window.__sim.placeProductAt('bottle-steel', 0.5, 0))
  const r = await page.evaluate(() => window.__sim.trySave())
  expect(r.ok).toBe(false)
  expect(r.reason).toBeTruthy()
})

// 주의: 여기의 depth 차이는 **스탠드 깊이 규격 차**(27" 130mm vs 34" 커브드 230mm)에서
// 온다. 두 제품 모두 패널 처짐(46.36mm)이 스탠드보다 작아 스탠드가 depth를 지배하므로,
// 이 단언은 곡률 자체를 검증하지 못한다. 곡률이 깊이를 만드는지는 단위 테스트
// `monitor.test.ts`의 곡률 지배 케이스(49" 32:9 @800R, 처짐 269.78mm)가 담당한다.
test('커브드 모니터가 평면보다 깊고 넓다 (수용기준 7)', async ({ page }) => {
  await page.evaluate(() => window.__sim.enterSim('desk-walnut-1400'))
  const flat = await page.evaluate(() => {
    const id = window.__sim.placeProductAt('monitor-27', -0.4, -0.15)!.id
    return window.__sim.itemBounds(id)
  })
  const curved = await page.evaluate(() => {
    const id = window.__sim.placeProductAt('monitor-34-curved', 0.4, -0.15)!.id
    return window.__sim.itemBounds(id)
  })
  expect(curved.depth).toBeGreaterThan(flat.depth)
  expect(curved.width).toBeGreaterThan(flat.width)
})

test('VESA 결합 시 스탠드가 사라진다 (수용기준 8)', async ({ page }) => {
  await page.evaluate(() => window.__sim.enterSim('desk-walnut-1400'))
  const before = await page.evaluate(() => {
    const id = window.__sim.placeProductAt('monitor-27', 0, -0.15)!.id
    return { id, parts: window.__sim.itemBounds(id).partCount }
  })
  const ok = await page.evaluate((id) => window.__sim.setMonitorMounted(id, true), before.id)
  expect(ok).toBe(true)
  const after = await page.evaluate((id) => window.__sim.itemBounds(id).partCount, before.id)
  // 스탠드는 foot + neck 2파트 — 정확히 그만큼만 줄어야 한다
  expect(after).toBe(before.parts - 2)
})
