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

// 배치·충돌 개선 수용 기준 1~7 (docs/superpowers/specs/2026-07-21 설계 스펙 §6).
// 좌표 근거: desk-oak-1200 상판 halfW=0.6 halfD=0.3 topY=0.74 (spec DB).
// 모니터 파라메트릭 base 0.2×0.13, panel 바닥 y=+0.19 → 컵(높이 0.098)이 화면
// 아래 캔틸리버 공간에 들어간다. 램프 base 반경 0.08.

async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/simulator')
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 })
  await page.evaluate(() => window.__sim.enterSim('desk-oak-1200'))
  await page.evaluate(() => window.__sim.reset())
  await page.waitForTimeout(150)
}

test('1. 컵을 모니터 화면 아래(캔틸리버 공간)에 놓아도 충돌 없음', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => {
    window.__sim.placeProductAt('monitor-27', 0, -0.12)
    window.__sim.placeProductAt('mug-ceramic', 0.22, -0.12) // 화면 폭 안, 스탠드 밖
  })
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => window.__sim.collided())).toBe(false)
})

test('2. 조명 옆 겹치지 않는 소품 배치는 충돌 없음', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => {
    window.__sim.placeProductAt('lamp-warm', 0.4, 0.1)
    window.__sim.placeProductAt('mug-ceramic', 0.53, 0.1) // base(±0.08) 밖
  })
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => window.__sim.collided())).toBe(false)
})

test('3. 키보드를 데스크 매트 위에 얹기 — 충돌 없음, 밑면=매트 상단', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => {
    window.__sim.placeProductAt('deskmat-900', 0, 0.1)
    window.__sim.placeProductAt('keyboard-tkl', 0, 0.1)
  })
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => window.__sim.collided())).toBe(false)
  const kb = await page.evaluate(
    () => window.__sim.placedItems().find((i) => i.specId === 'keyboard-tkl')!.pos,
  )
  // 매트 상단 = 0.74 + 0.004
  expect(kb.y).toBeCloseTo(0.744, 3)
})

test('4. 모니터 암 머리 캔틸리버 — 옛 클램프로는 불가능한 z에 배치 허용, 경계 위반 없음', async ({ page }) => {
  await boot(page)
  // 옛 하드 클램프 한계: |z| ≤ 0.3-0.1925-0.01 = 0.0975. z=0.15는 옛 코드에선 불가.
  const res = await page.evaluate(() => window.__sim.placeProductAt('monitor-arm-white', 0, 0.15))
  await page.waitForTimeout(100)
  expect(res).not.toBeNull()
  const arm = await page.evaluate(
    () => window.__sim.placedItems().find((i) => i.specId === 'monitor-arm-white')!,
  )
  expect(arm.pos.z).toBeCloseTo(0.15, 6) // 클램프 미작동
  expect(await page.evaluate(() => window.__sim.boundaryViolation())).toBe(false)
})

test('5+6. 암 회전으로 옆 소품과 겹침 → 충돌 플래그 + 저장 거부', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => {
    window.__sim.placeProductAt('monitor-arm-white', 0, 0)
    // 암 base-yaw 피벗은 후면 클램프(z≈-0.13)에 있어 스윙 시 암이 z≈-0.13 평면을
    // 쓸고 지나간다 — 병을 그 스윕 영역에 둬야 겹친다(실측 에셋 리치 기준).
    window.__sim.placeProductAt('bottle-steel', 0.15, -0.13)
  })
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => window.__sim.collided())).toBe(false)
  // base-yaw ±90° 중 병 쪽으로 스윙하는 방향에서 충돌해야 함
  const collided = await page.evaluate(() => {
    const arm = window.__sim.placedItems().find((i) => i.specId === 'monitor-arm-white')!
    window.__sim.articulate(arm.id, 'base-yaw', 90)
    if (window.__sim.collided()) return true
    window.__sim.articulate(arm.id, 'base-yaw', -90)
    return window.__sim.collided()
  })
  expect(collided).toBe(true)
  const save = await page.evaluate(() => window.__sim.trySave())
  expect(save.ok).toBe(false)
  await expect(page.getByTestId('collision-warning')).toBeVisible()
  await expect(page.getByTestId('collision-warning')).toContainText('저장')
})

test('7. 지지 파트(정적 소품 footprint)가 상판 밖 → 경계 위반, 정상 배치는 저장 성공', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => window.__sim.placeProductAt('mug-ceramic', 0.7, 0)) // halfW 0.6 밖
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => window.__sim.boundaryViolation())).toBe(true)
  expect(await page.evaluate(() => window.__sim.trySave().ok)).toBe(false)
  // 정상 위치로 재배치하면 저장 통과
  await page.evaluate(() => {
    window.__sim.reset()
    window.__sim.placeProductAt('mug-ceramic', 0.3, 0.1)
  })
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => window.__sim.trySave().ok)).toBe(true)
  await expect(page.getByTestId('save-toast')).toBeVisible()
})
