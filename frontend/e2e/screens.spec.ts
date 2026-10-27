import { test, expect } from '@playwright/test'
import { stubAuthenticatedSession } from './helpers/auth'
import { seedCoachTourSeen } from './helpers/tour'
import * as path from 'node:path'

// /simulator는 로그인 진입 관문 뒤다(결정 8 / D14) — 세션 스텁 없이 goto하면 /login으로
// 튕겨 씬이 뜨지 않는다. Playwright에 백엔드를 붙이지 않으므로(ADR-0016 결정 5) 프론트가
// 실제로 부르는 인증 엔드포인트만 네트워크 레벨로 막는다.
test.beforeEach(async ({ page }) => {
  await stubAuthenticatedSession(page)
  await seedCoachTourSeen(page)
})

// Repo-relative output (never a machine-specific absolute path):
// frontend/test-results/screens/ — playwright's default artifact dir, gitignored.
// process.cwd() is frontend/ (playwright runs from the config's dir). import.meta
// is unusable here: the Next package.json has no "type": "module", so specs load as CJS.
const OUT = path.join(process.cwd(), 'test-results', 'screens')

// A 1600x1000 PNG of a rendered scene compresses far above this; a blank/black
// canvas (renderer dead) compresses to a few KB and fails the gate.
const MIN_RENDERED_PNG_BYTES = 20_000

test('capture wow-loop screenshots', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/simulator')
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 })
  await page.evaluate(() => window.__sim.enterSim('desk-oak-1200'))
  await page.waitForTimeout(400) // enter at the default neutral room light — no override

  const hideHud = () =>
    page.evaluate(() => {
      const r = document.querySelector('.ui-root') as HTMLElement | null
      if (r) r.style.display = 'none'
    })
  const showHud = () =>
    page.evaluate(() => {
      const r = document.querySelector('.ui-root') as HTMLElement | null
      if (r) r.style.display = ''
    })

  async function sceneShot(name: string, preset: string): Promise<void> {
    await page.evaluate((p) => window.__sim.setCameraPreset(p as never), preset)
    await page.waitForTimeout(900)
    await hideHud()
    const buf = await page.screenshot({ path: path.join(OUT, name) })
    expect(buf.length, `${name} should contain a rendered (non-blank) scene`).toBeGreaterThan(
      MIN_RENDERED_PNG_BYTES,
    )
    await showHud()
  }

  // Neutral default state (proves §1.5: walls/floor render as the neutral grey
  // they are; mood is lighting-only, not painted albedo).
  await sceneShot('neutral.png', 'hero')
  await sceneShot('front.png', 'front')
  await sceneShot('side.png', 'side')
  await sceneShot('back.png', 'back')
  await sceneShot('top.png', 'top')

  // room-light pair from the hero angle (mood now comes from placed lamps only)
  await page.evaluate(() => window.__sim.setCameraPreset('hero'))
  await page.waitForTimeout(900)
  await hideHud()
  await page.evaluate(() => window.__sim.setRoomLight(false))
  await page.waitForTimeout(500)
  const offShot = await page.screenshot({ path: path.join(OUT, 'room-off-lamp-mood.png') })
  await page.evaluate(() => window.__sim.setRoomLight(true))
  await page.waitForTimeout(500)
  const onShot = await page.screenshot({ path: path.join(OUT, 'room-on.png') })
  await showHud()
  // The toggle must actually change the frame (guards a frozen/blank canvas).
  expect(offShot.equals(onShot), 'room-light off/on frames must differ').toBe(false)
  expect(offShot.length).toBeGreaterThan(MIN_RENDERED_PNG_BYTES)
  expect(onShot.length).toBeGreaterThan(MIN_RENDERED_PNG_BYTES)

  // framed HUD shot (room light + wall toggles panel)
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, 'hud.png') })
})
