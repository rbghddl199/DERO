import { test, expect, type Page } from '@playwright/test';
import { stubAuthenticatedSession } from './helpers/auth';
import { seedCoachTourSeen } from './helpers/tour';

// /simulator는 로그인 진입 관문 뒤다(결정 8 / D14) — 세션 스텁 없이 goto하면 /login으로
// 튕겨 씬이 뜨지 않는다. Playwright에 백엔드를 붙이지 않으므로(ADR-0016 결정 5) 프론트가
// 실제로 부르는 인증 엔드포인트만 네트워크 레벨로 막는다.
test.beforeEach(async ({ page }) => {
  await stubAuthenticatedSession(page);
  await seedCoachTourSeen(page);
});

// Thresholds re-baselined to the ACES-Filmic render, then re-verified across the
// D17 stylized additions (2026-07-20, final form): weak toon ramp (toonPhysical.ts)
// + always-on screen-space contour lines (contourNode.ts — replaced the interim
// Fresnel silhouette ink, see git history for its measurements). The contour lines
// are thin (1-texel pre-SMAA) so region means move only slightly; the full suite
// stays green against the existing floors/ceilings with headroom (re-run 2026-07-20,
// SwiftShader, --retries=0). Ratio/band guards are backend-robust and unchanged.
// The selection outline is always in the pipeline but early-returns when nothing is
// selected, so these baselines (0 selected) are unaffected by it.
//
// Lighting-model gates (docs/context/3d-scene.md 2026-07-18):
//   1. Room light = fixed NEUTRAL base — no colour-temperature bias, desk clearly lit.
//   2. Room light off = dim but never pitch black (low ambient floor).
//   3. Mood comes ONLY from placed lamps: local pool (distance falloff) at the
//      lamp, global light untouched.
//   7. Shadow-caster cap: room key 1 + at most 2 lamps; extra lamps glow shadowless.
// UI: room-light + wall toggles replace the old warm/cool + brightness panel.
const WALL = { fx0: 0.25, fy0: 0.08, fx1: 0.75, fy1: 0.28 }; // upper wall band

type RGB = { r: number; g: number; b: number };
const sum = (c: RGB): number => c.r + c.g + c.b;
const rb = (c: RGB): number => c.r / Math.max(c.b, 1);

async function bootEmpty(page: Page): Promise<void> {
  await page.goto('/simulator');
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
  await page.evaluate(() => {
    window.__sim.enterSim('desk-oak-1200');
    window.__sim.reset(); // clear the hero population -> 0 placed lamps
    window.__sim.setCameraPreset('hero');
    // The wall band below is sampled for colour NEUTRALITY of the rig, so the wall's own
    // finish must be pinned — since DERO-508 it is user data (per-wall material and
    // variant), and a charcoal or oak-slat wall would fail an R/B guard that is not about
    // the wall at all. The rig's own achromaticity is asserted machine-side in
    // `tests/roomRig.test.ts` (the canon `scene/roomRig.ts` shares with the admin emissive
    // preview); this pin keeps the pixel-level guard measuring the same thing it always did.
    window.__sim.applyRoomPreset('neutral');
  });
  await page.waitForTimeout(400);
}

const wallSample = (page: Page): Promise<RGB> =>
  page.evaluate((w) => window.__sim.sampleRegion(w.fx0, w.fy0, w.fx1, w.fy1), WALL);
const centerSample = (page: Page): Promise<RGB> => page.evaluate(() => window.__sim.sampleCenter());

test('room light: neutral fixed base, off = dim but not black, console clean', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await bootEmpty(page);

  // (1) ON + 0 lamps: neutral grey wall reads neutral (no colour-temp bias), desk lit
  const wallOn = await wallSample(page);
  const centerOn = await centerSample(page);
  console.log(
    `[lighting] room-on wall R/B=${rb(wallOn).toFixed(3)} center sum=${sum(centerOn).toFixed(1)}`,
  );
  expect(rb(wallOn)).toBeGreaterThan(0.9);
  expect(rb(wallOn)).toBeLessThan(1.12);
  expect(sum(centerOn)).toBeGreaterThan(400); // desk brightly lit (ACES; measured 582.8)

  // (2) OFF: markedly darker, but silhouettes stay readable (ambient floor)
  await page.evaluate(() => window.__sim.setRoomLight(false));
  await page.waitForTimeout(300);
  const centerOff = await centerSample(page);
  console.log(`[lighting] room-off center sum=${sum(centerOff).toFixed(1)}`);
  expect(sum(centerOff)).toBeLessThan(sum(centerOn) * 0.55);
  expect(sum(centerOff)).toBeGreaterThan(60); // readable dim, never pitch black (measured 143.8)

  await page.evaluate(() => window.__sim.setRoomLight(true));
  expect(errors).toEqual([]);
});

test('placed lamp is a LOCAL warm pool with falloff; global light unchanged', async ({ page }) => {
  await bootEmpty(page);

  // baseline with room light OFF -> dim neutral scene
  await page.evaluate(() => window.__sim.setRoomLight(false));
  await page.waitForTimeout(300);
  const cDark = await centerSample(page);
  const wDark = await wallSample(page);

  // lamp-warm lands at the desk centre (default slot) -> local pool right there
  await page.evaluate(() => window.__sim.placeProduct('lamp-warm'));
  await page.waitForTimeout(400);
  const cLamp = await centerSample(page);
  const wLamp = await wallSample(page);
  console.log(
    `[lighting] dark center sum=${sum(cDark).toFixed(1)} R/B=${rb(cDark).toFixed(3)} | ` +
      `lamp center sum=${sum(cLamp).toFixed(1)} R/B=${rb(cLamp).toFixed(3)} | ` +
      `wall sum ${sum(wDark).toFixed(1)} -> ${sum(wLamp).toFixed(1)}`,
  );
  // local: the lamp's spot brightens its own region…
  expect(sum(cLamp)).toBeGreaterThan(sum(cDark) * 1.3);
  // …with the 2700K spec colour (warm). (No R/B comparison against the dark
  // baseline: unclipped dim wood albedo already has a high R/B ratio.)
  expect(rb(cLamp)).toBeGreaterThan(1.5);
  // global restraint: the distant wall band stays essentially unchanged (falloff)
  expect(sum(wLamp)).toBeLessThan(sum(wDark) * 1.3 + 6);

  // with the room light back ON the wall band stays neutral despite the warm lamp
  await page.evaluate(() => window.__sim.setRoomLight(true));
  await page.waitForTimeout(300);
  const wOn = await wallSample(page);
  console.log(`[lighting] room-on+lamp wall R/B=${rb(wOn).toFixed(3)}`);
  expect(rb(wOn)).toBeLessThan(1.15);
});

test('shadow-caster cap: room key 1 + brightest 2 lamps; extras glow shadowless', async ({
  page,
}) => {
  await bootEmpty(page);

  await page.evaluate(() => {
    window.__sim.placeProduct('lamp-warm');
    window.__sim.placeProduct('lamp-task');
    window.__sim.placeProduct('lamp-warm');
    window.__sim.placeProduct('lamp-warm');
    window.__sim.placeProduct('lamp-task');
  });
  const info = await page.evaluate(() => window.__sim.lightingInfo());
  expect(info.lampCount).toBe(5);
  expect(info.roomLightOn).toBe(true);
  // 아래 castShadow 어서션들이 전부 통과해도 렌더러 스위치가 꺼져 있으면 그림자는 한 장도
  // 안 그려진다 — DERO-248이 정확히 그 상태였다(`<Canvas>`에 shadows prop이 없어
  // R3F가 createRenderer의 설정을 덮어씀). 플래그가 아니라 렌더러를 직접 재는 유일한 줄.
  expect(info.shadowMapEnabled).toBe(true);
  // 창문 없는 방은 주간에도 태양 세기 0이다(DERO-511, ADR-0030 결정 7) — neutral
  // 프리셋엔 창문이 없으므로 캐스터는 램프 2뿐이고, 창문을 넣어야 태양이 세 번째다.
  expect(info.shadowCasters).toBe(2);
  await page.evaluate(() =>
    window.__sim.setWallWindow('front', {
      centerXMm: 0,
      centerYMm: 1600,
      widthMm: 1200,
      heightMm: 1400,
    }),
  );
  expect((await page.evaluate(() => window.__sim.lightingInfo())).shadowCasters).toBe(3); // room key(=태양) 1 + lamp 2
  // 캐스터는 배치 순서가 아니라 **실효 lm 내림차순**으로 배정된다 (223 확정, 235에서
  // 광원 슬롯 고정으로 실제 구현됨 — 앞 LAMP_SHADOW_CAP개 슬롯이 캐스터고 배정은
  // lampSlotOrder가 정한다). 위 배치는 warm 400lm · task 560lm 교대라 task 2개(인덱스
  // 1·4)가 캐스터를 갖고 400lm짜리 셋은 그림자 없이 빛난다.
  expect(info.lamps.map((l) => l.castShadow)).toEqual([false, true, false, false, true]);

  // distribution -> cone wiring: flood (lamp-task) is wider than spot (lamp-warm)
  const spotAngle = info.lamps.find((l) => l.distribution === 'spot')!.angle;
  const floodAngle = info.lamps.find((l) => l.distribution === 'flood')!.angle;
  expect(floodAngle).toBeGreaterThan(spotAngle);

  // 방 조명 off는 태양(key)을 끄지 않는다 — 주간 + 조명 OFF가 "자연광만 드는 아침"이라
  // 캐스터는 3 그대로다(ADR-0030 결정 4·7, DERO-510).
  await page.evaluate(() => window.__sim.setRoomLight(false));
  expect((await page.evaluate(() => window.__sim.lightingInfo())).shadowCasters).toBe(3);

  // 태양을 끄는 것은 시간대다 -> 실효 캐스터 2개. (235 이후 key의 castShadow는 계속
  // true고 intensity만 0이다 — 플래그를 토글하면 그게 곧 셰이더 재빌드다. 그래서
  // lightingInfo는 플래그가 아니라 sunOn으로 센다.)
  await page.evaluate(() => window.__sim.setTimeOfDay('NIGHT'));
  const infoOff = await page.evaluate(() => window.__sim.lightingInfo());
  expect(infoOff.shadowCasters).toBe(2);
  // 시간대 전환은 방 조명 값을 덮어쓰지만(야간 기본값 OFF) 광원 집합은 그대로다.
  expect(infoOff.lampCount).toBe(5);

  // wall toggles drive wall visibility (UI wiring verified via hooks + DOM) — room-light
  // now lives in the top navbar (always visible, no rail click needed); wall toggles
  // stayed behind the rail, but the category was renamed 'light' -> 'wall' when room
  // light moved out to the navbar (EditorSidebar.tsx/EditorTopBar.tsx, 2026-07-27).
  await expect(page.getByTestId('room-light')).toBeVisible();
  await page.getByTestId('rail-wall').click();
  for (const side of ['left', 'front', 'right']) {
    await expect(page.getByTestId(`wall-${side}`)).toBeVisible();
  }
  await page.getByTestId('wall-left').click();
  const ws = await page.evaluate(() => window.__sim.wallState());
  expect(ws.left).toBe(false); // was on by default -> toggled off
});

// D17 selection outline (REQ-SIM-11). The outline node lives in the post pipeline
// permanently but early-returns while nothing is selected. This test verifies the
// two properties that ARE deterministic on the headless WebGL2/SwiftShader backend:
//   (1) selecting + clearing a product drives the OutlineNode.updateBefore path and
//       its custom TSL (edge detect / separable blur) WITHOUT any console error or
//       page crash — i.e. the node TRANSPILES and RUNS on WebGL2 (the flagged risk);
//   (2) the un-selected steady state is byte-identical before and after a
//       select→clear cycle (the early-return leaves no lingering outline).
// NOTE — pixel appearance is NOT asserted here: headless Chromium/SwiftShader has no
// WebGPU adapter, and SwiftShader's OutlineNode depth pre-pass renders no visible
// edge (verified via screenshot). The warm-rim look must be QA'd on WebGPU hardware.
const OUT = { fx0: 0.3, fy0: 0.3, fx1: 0.7, fy1: 0.62 };
const outSample = (page: Page): Promise<RGB> =>
  page.evaluate((o) => window.__sim.sampleRegion(o.fx0, o.fy0, o.fx1, o.fy1), OUT);

async function bootHero(page: Page): Promise<void> {
  await page.goto('/simulator');
  await page.waitForFunction(() => window.__sim?.ready === true, null, { timeout: 30_000 });
  await page.evaluate(() => {
    window.__sim.enterSim('desk-oak-1200'); // hero population stays -> products present
    window.__sim.setCameraPreset('hero');
  });
  await page.waitForTimeout(400);
}

test('selection outline: runs clean on WebGL2 and leaves no residue on deselect', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await bootHero(page);

  const monitorId = await page.evaluate(() => {
    const m = window.__sim.placedItems().find((i) => i.specId === 'monitor-27');
    return m ? m.id : null;
  });
  expect(monitorId).not.toBeNull();

  const before = await outSample(page); // nothing selected -> outline early-returns
  await page.evaluate((id) => window.__sim.outlinePlaced(id), monitorId);
  await page.waitForTimeout(200);
  await outSample(page); // drives the full OutlineNode render path on WebGL2
  await page.evaluate(() => window.__sim.outlinePlaced(null));
  await page.waitForTimeout(200);
  const after = await outSample(page); // deselected -> back to baseline

  // (2) early-return invariant: select→clear leaves the frame unchanged
  expect(Math.abs(sum(after) - sum(before))).toBeLessThan(3);
  // (1) the outline path transpiled and executed without error on WebGL2/SwiftShader
  expect(errors).toEqual([]);
});

// D17 contour-line toggle: lines darken edge pixels, so turning them on must
// darken the sampled region, and turning them back off must restore the frame.
// The contour starts OFF (2026-08-05) — the user opts in from the top bar.
// Exercises the UI chip (DOM path), not just the hook.
test('contour lines toggle on/off via the UI chip and restores the frame', async ({ page }) => {
  await bootHero(page);

  expect(await page.evaluate(() => window.__sim.contourLinesOn())).toBe(false);
  const withoutLines = await outSample(page);

  // 외곽선 토글은 상단 네비바에 상시 노출된다(EditorTopBar.tsx, 좌측 레일 → 네비바
  // 2026-07-27 재이동) — 카테고리를 열 필요 없이 바로 클릭, testid는 그대로.
  await page.getByTestId('contour-lines').click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__sim.contourLinesOn())).toBe(true);
  const withLines = await outSample(page);
  expect(sum(withoutLines)).toBeGreaterThan(sum(withLines) + 0.5); // dark lines drawn

  await page.getByTestId('contour-lines').click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__sim.contourLinesOn())).toBe(false);
  const restored = await outSample(page);
  expect(Math.abs(sum(restored) - sum(withoutLines))).toBeLessThan(3);
});

// 램프 밝기·색온도 조절 (REQ-SIM-08, DERO-287). 조절이 실제 광원에 실렸는지는
// `lightingInfo().lamps[]`가 **인스턴스 반영값**(규격이 아니라 사용자 조절 결과)을 싣기
// 때문에 그 두 값으로 잰다. 마지막 shaderProgramCount 어서션이 이 테스트의 핵심 가드다 —
// 이 경로는 광원을 만들거나 `visible`/`castShadow`를 만지지 않는 순수 유니폼 축이므로
// 프로그램 수가 늘면 씬 전역 셰이더가 다시 빌드된 것이고, 실기 WebGPU에서 1.2~1.9초
// 스톨로 나타난다 (DERO-235).

/** 프로그램 수가 멎을 때까지 기다린다 — 램프를 놓은 직후엔 갓 쿠키가 아직 굽고 있다. */
async function settledProgramCount(page: Page): Promise<number> {
  let prev = -1;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(300);
    const n = await page.evaluate(() => window.__sim.lightingInfo().shaderProgramCount);
    if (n === prev) return n;
    prev = n;
  }
  return prev;
}

test('lamp brightness/colour-temp knobs land on the light, clamp, and rebuild no shader', async ({
  page,
}) => {
  await bootEmpty(page);

  const taskId = await page.evaluate(() => window.__sim.placeProduct('lamp-task')!.id);
  const programsBefore = await settledProgramCount(page);
  const spec = await page.evaluate((id) => window.__sim.lampInfo(id)!, taskId);
  const lamp = (): Promise<{ lumens: number; colorTempK: number }> =>
    page.evaluate(() => window.__sim.lightingInfo().lamps[0]);

  // 기준선: 안 만진 램프는 규격 그대로 (배율 1)
  expect(spec.brightnessScale).toBe(1);
  const zero = await lamp();
  expect(zero.lumens).toBeCloseTo(spec.baseLumens, 6);
  expect(zero.colorTempK).toBe(spec.colorTempK);

  // (1) 배율 2.0 -> 실효 lm = 기준 lm × 2가 광원에 실린다
  await page.evaluate((id) => window.__sim.setLampBrightnessScale(id, 2.0), taskId);
  expect((await lamp()).lumens).toBeCloseTo(spec.baseLumens * 2, 6);

  // (2) 색온도 6500K -> 광원 색온도도 6500K
  await page.evaluate((id) => window.__sim.setLampColorTempK(id, 6500), taskId);
  expect((await lamp()).colorTempK).toBe(6500);

  // (3) 범위 밖 입력은 엔진이 자른다 — 배율 9는 상한 2.0에서, 900K는 하한 2700K에서 멈춘다
  await page.evaluate((id) => window.__sim.setLampBrightnessScale(id, 9), taskId);
  await page.evaluate((id) => window.__sim.setLampColorTempK(id, 900), taskId);
  const clamped = await lamp();
  expect(clamped.lumens).toBeCloseTo(spec.baseLumens * 2, 6); // 2.0에서 멈춤
  expect(clamped.colorTempK).toBe(2700);
  const knobs = await page.evaluate((id) => window.__sim.lampInfo(id)!, taskId);
  expect(knobs.brightnessScale).toBe(2);
  expect(knobs.effectiveLumens).toBeCloseTo(spec.baseLumens * 2, 6);

  // (4) 핵심 가드: 유니폼만 바뀌었으므로 셰이더 프로그램 수는 조절 전과 같아야 한다
  const programsAfter = await settledProgramCount(page);
  console.log(`[lighting] shader programs ${programsBefore} -> ${programsAfter}`);
  expect(programsAfter).toBe(programsBefore);

  // (5) 사양은 세 상태로 갈린다 — lamp-task는 **범위형**(min < max),
  //     lamp-warm은 **고정형**(min === max, 2700K / 400lm).
  //     세 번째 상태인 **미제공**(둘 다 null)은 지금 저작 제품이 0개라
  //     `tests/lighting.test.ts`가 지킨다.
  //     `*Spec`(캡션용 원본, lm)과 `*Marker`(마커 위치, 배율 축)는 **일부러 갈린다** —
  //     lamp-task 사양 하한 200lm은 배율 0.357이라 조절 하한 0.5(= 280lm)에서 잘린다.
  expect(knobs.colorTempSpec).toEqual({ min: 3000, max: 5700 });
  expect(knobs.brightnessSpec).toEqual({ min: 200, max: 560 });
  expect(knobs.colorTempMarker).toEqual({ min: 3000, max: 5700 });
  expect(knobs.brightnessMarker).toEqual({ min: 0.5, max: 1 });
  const warmId = await page.evaluate(() => window.__sim.placeProduct('lamp-warm')!.id);
  const warm = await page.evaluate((id) => window.__sim.lampInfo(id)!, warmId);
  expect(warm.colorTempSpec).toEqual({ min: 2700, max: 2700 });
  expect(warm.brightnessSpec).toEqual({ min: 400, max: 400 });
  expect(warm.colorTempMarker).toEqual({ min: 2700, max: 2700 });
  expect(warm.brightnessMarker).toEqual({ min: 1, max: 1 });
});
