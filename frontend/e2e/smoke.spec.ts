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

test('scene boots headless on the WebGL2 fallback and renders a non-blank frame', async ({ page }) => {
  await page.goto('/simulator')
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 })

  expect(await page.evaluate(() => window.__sim.backend)).toBe('webgl')

  await page.evaluate(() => window.__sim.enterSim('desk-oak-1200'))
  await page.waitForTimeout(300)
  const px = await page.evaluate(() => window.__sim.sampleCenter())
  expect(px.r + px.g + px.b).toBeGreaterThan(30)
})
