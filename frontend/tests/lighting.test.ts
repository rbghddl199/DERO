import { describe, it, expect } from 'vitest'
import {
  colorTempToRGB,
  warmthRatio,
  beamHalfAngleRad,
  penumbraFor,
  lampSlotOrder,
  LAMP_SHADOW_CAP,
  LAMP_LIGHT_SLOT_COUNT,
  BRIGHTNESS_SCALE_MIN,
  BRIGHTNESS_SCALE_MAX,
  COLOR_TEMP_MIN_K,
  COLOR_TEMP_MAX_K,
  clampBrightnessScale,
  clampColorTempK,
  colorTempMarkerSpan,
  brightnessMarkerSpan,
  specSpan,
} from '../src/three/scene/lighting'

describe('colorTempToRGB blackbody approx (per-lamp local light colour)', () => {
  it('2700K is warm (R/B > 1.6)', () => {
    expect(warmthRatio(colorTempToRGB(2700))).toBeGreaterThan(1.6)
  })
  it('6500K is neutral (R/B ~ 1)', () => {
    expect(warmthRatio(colorTempToRGB(6500))).toBeLessThan(1.05)
  })
  it('warmth is monotonic across the range', () => {
    const w2700 = warmthRatio(colorTempToRGB(2700))
    const w4000 = warmthRatio(colorTempToRGB(4000))
    const w6500 = warmthRatio(colorTempToRGB(6500))
    expect(w2700).toBeGreaterThan(w4000)
    expect(w4000).toBeGreaterThan(w6500)
  })
  it('channels stay within [0,1]', () => {
    for (const k of [2200, 2700, 4000, 5000, 6500]) {
      const c = colorTempToRGB(k)
      for (const v of [c.r, c.g, c.b]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('distribution -> cone (확산형 vs 집중형)', () => {
  it('beam half-angle: spot < flood < ambient', () => {
    expect(beamHalfAngleRad('spot')).toBeLessThan(beamHalfAngleRad('flood'))
    expect(beamHalfAngleRad('flood')).toBeLessThan(beamHalfAngleRad('ambient'))
    expect(beamHalfAngleRad('spot')).toBeGreaterThan(0)
  })
  it('penumbra: spot edge is crisper than flood/ambient', () => {
    expect(penumbraFor('spot')).toBeLessThan(penumbraFor('flood'))
    expect(penumbraFor('flood')).toBeLessThan(penumbraFor('ambient'))
    for (const d of ['spot', 'flood', 'ambient'] as const) {
      expect(penumbraFor(d)).toBeGreaterThanOrEqual(0)
      expect(penumbraFor(d)).toBeLessThanOrEqual(1)
    }
  })
})

describe('lampSlotOrder (실효 lm 내림차순 — 밝은 램프가 캐스터 슬롯을 먼저 가진다)', () => {
  it('캐스터 슬롯은 앞 2칸, 램프 슬롯은 6칸', () => {
    expect(LAMP_SHADOW_CAP).toBe(2)
    expect(LAMP_LIGHT_SLOT_COUNT).toBe(6)
  })
  it('램프가 없으면 빈 배열', () => {
    expect(lampSlotOrder([])).toEqual([])
  })
  it('밝은 램프가 앞 슬롯을 가진다', () => {
    expect(lampSlotOrder([400, 560, 300])).toEqual([1, 0, 2])
  })
  it('배치 순서가 아니라 lm 순이다 (223 규칙 — 어두운 램프가 캐스터 칸을 못 먹는다)', () => {
    // e2e와 같은 배치: warm 400 · task 560 교대 → 560짜리 둘이 캐스터 2칸을 가진다
    expect(lampSlotOrder([400, 560, 400, 400, 560])).toEqual([1, 4, 0, 2, 3])
  })
  it('동률은 배치 순서를 지킨다 (램프를 더 놓아도 기존 그림자가 옮겨 다니지 않게)', () => {
    expect(lampSlotOrder([400, 400, 400, 400])).toEqual([0, 1, 2, 3])
  })

  it('배율이 순서를 뒤집는다 (실효 lm = 기준 lm × 배율, 287)', () => {
    // Arrange: 규격만 보면 task(560)가 warm(400)보다 밝다
    const baseLumens = [400, 560]
    // Act: warm을 2.0배로 올리면 실효 800 vs 560
    const scales = [2.0, 1.0]
    const effective = baseLumens.map((lm, i) => lm * scales[i])

    // Assert: 규격 순서는 task 우선, 실효 순서는 warm 우선으로 뒤집힌다
    expect(lampSlotOrder(baseLumens)).toEqual([1, 0])
    expect(lampSlotOrder(effective)).toEqual([0, 1])
  })

  it('배율을 내리면 밝던 램프가 캐스터 칸을 잃는다', () => {
    // Arrange: task(560) 하나 + warm(400) 둘, task를 0.5배로 내린다 → 실효 280
    const effective = [560 * 0.5, 400, 400]

    // Act
    const order = lampSlotOrder(effective)

    // Assert: 앞 LAMP_SHADOW_CAP칸(캐스터)을 warm 둘이 가져간다
    expect(order.slice(0, LAMP_SHADOW_CAP)).toEqual([1, 2])
    expect(order[2]).toBe(0)
  })
})

describe('사용자 밝기·색온도 조절 범위 (REQ-SIM-08, 287)', () => {
  it('배율 범위는 0.5~2.0, 색온도 범위는 2700~6500K (잠정값)', () => {
    expect(BRIGHTNESS_SCALE_MIN).toBe(0.5)
    expect(BRIGHTNESS_SCALE_MAX).toBe(2.0)
    expect(COLOR_TEMP_MIN_K).toBe(2700)
    expect(COLOR_TEMP_MAX_K).toBe(6500)
  })

  it('배율 clamp — 경계는 그대로, 밖은 잘린다', () => {
    expect(clampBrightnessScale(0.5)).toBe(0.5)
    expect(clampBrightnessScale(2.0)).toBe(2.0)
    expect(clampBrightnessScale(1.25)).toBe(1.25)
    expect(clampBrightnessScale(0.1)).toBe(0.5)
    expect(clampBrightnessScale(9)).toBe(2.0)
    expect(clampBrightnessScale(-3)).toBe(0.5)
  })

  it('색온도 clamp — 경계는 그대로, 밖은 잘린다', () => {
    expect(clampColorTempK(2700)).toBe(2700)
    expect(clampColorTempK(6500)).toBe(6500)
    expect(clampColorTempK(5000)).toBe(5000)
    expect(clampColorTempK(1800)).toBe(2700)
    expect(clampColorTempK(9000)).toBe(6500)
  })
})

describe('사양 마커 (287) — 범위형·고정형·미제공 세 상태', () => {
  it('색온도: 조절 범위 안 구간은 그대로 나온다 (lamp-task 3000~5700K)', () => {
    expect(colorTempMarkerSpan(3000, 5700)).toEqual({ min: 3000, max: 5700 })
  })

  it('색온도: 조절 범위를 넘는 구간은 잘린다', () => {
    expect(colorTempMarkerSpan(2000, 8000)).toEqual({ min: 2700, max: 6500 })
  })

  it('색온도: 고정형(min == max)은 그 값 하나로 나온다 — 경계값도 통과한다 (lamp-warm 2700K)', () => {
    // 2700K는 조절 하한(COLOR_TEMP_MIN_K)과 같은 값이다 — 경계 판정이 strict가 아니면
    // 여기서 null로 떨어져 마커가 통째로 사라진다.
    expect(colorTempMarkerSpan(2700, 2700)).toEqual({ min: 2700, max: 2700 })
    expect(colorTempMarkerSpan(6500, 6500)).toEqual({ min: 6500, max: 6500 })
    expect(colorTempMarkerSpan(4000, 4000)).toEqual({ min: 4000, max: 4000 })
  })

  it('색온도: 범위가 없으면(둘 다 NULL — 사양 미제공) null', () => {
    expect(colorTempMarkerSpan(undefined, undefined)).toBeNull()
    expect(colorTempMarkerSpan(3000, undefined)).toBeNull()
    expect(colorTempMarkerSpan(undefined, 5700)).toBeNull()
  })

  it('색온도: 조절 범위 밖으로 완전히 벗어난 구간은 null', () => {
    expect(colorTempMarkerSpan(1500, 2000)).toBeNull()
    expect(colorTempMarkerSpan(7000, 9000)).toBeNull()
  })

  it('밝기: 사양 lm 구간을 기준 lm으로 나눠 배율 축으로 옮긴다 (lamp-task 200~560 / 560)', () => {
    // 200/560 = 0.357 → 하한 0.5로 클램프, 560/560 = 1.0
    expect(brightnessMarkerSpan(560, 200, 560)).toEqual({ min: 0.5, max: 1 })
  })

  it('밝기: 기준 lm이 작으면 구간이 배율 축에서 위로 밀린다', () => {
    // 400~800 lm / 기준 400 = 1.0~2.0 (둘 다 조절 범위 안)
    expect(brightnessMarkerSpan(400, 400, 800)).toEqual({ min: 1, max: 2 })
  })

  it('밝기: 고정형(min == max)은 배율 축의 한 점이 된다 (lamp-warm 400lm ÷ 400 = 1.0)', () => {
    expect(brightnessMarkerSpan(400, 400, 400)).toEqual({ min: 1, max: 1 })
    // 배율 축 경계에 정확히 놓이는 고정값도 통과해야 한다 — 200/400 = 하한 0.5, 800/400 = 상한 2.0
    expect(brightnessMarkerSpan(400, 200, 200)).toEqual({ min: 0.5, max: 0.5 })
    expect(brightnessMarkerSpan(400, 800, 800)).toEqual({ min: 2, max: 2 })
  })

  it('밝기: 범위가 없으면(둘 다 NULL — 사양 미제공) null', () => {
    expect(brightnessMarkerSpan(400, undefined, undefined)).toBeNull()
    expect(brightnessMarkerSpan(560, 200, undefined)).toBeNull()
  })

  it('밝기: 조절 범위 밖으로 완전히 벗어난 구간은 null', () => {
    // 2000~3000 lm / 기준 400 = 5.0~7.5 → 상한 2.0 밖
    expect(brightnessMarkerSpan(400, 2000, 3000)).toBeNull()
    // 50~100 lm / 기준 1000 = 0.05~0.1 → 하한 0.5 밖
    expect(brightnessMarkerSpan(1000, 50, 100)).toBeNull()
  })

  it('밝기: 기준 lm이 0이거나 음수면 나눌 수 없으므로 null', () => {
    expect(brightnessMarkerSpan(0, 200, 560)).toBeNull()
    expect(brightnessMarkerSpan(-1, 200, 560)).toBeNull()
  })

  it('뒤집힌 사양 입력(min > max)도 정렬해서 받는다 — 오타로 마커가 사라지지 않게', () => {
    expect(colorTempMarkerSpan(5700, 3000)).toEqual({ min: 3000, max: 5700 })
    expect(brightnessMarkerSpan(400, 800, 400)).toEqual({ min: 1, max: 2 })
  })
})

describe('저작 사양 원본 (287) — 캡션은 클램프 안 된 값을 읽는다', () => {
  it('사양이 조절 범위 밖으로 잘려도 원본은 그대로다 (lamp-task 200~560lm)', () => {
    // 캡션은 "제품이 어떤 물건인가"라 슬라이더 하한과 무관하게 참이어야 한다.
    expect(specSpan(200, 560)).toEqual({ min: 200, max: 560 })
    // 반면 마커는 조절 축 위의 투영이라 하한 ×0.5(= 280lm)에서 시작한다. 둘이 갈리는
    // 것이 설계다 — 200/560 = 0.357이 BRIGHTNESS_SCALE_MIN 밖이다.
    expect(brightnessMarkerSpan(560, 200, 560)).toEqual({ min: 0.5, max: 1 })
  })

  it('색온도도 같다 — 2000K짜리 제품이 들어와도 원본은 안 잘린다', () => {
    expect(specSpan(2000, 5000)).toEqual({ min: 2000, max: 5000 })
    expect(colorTempMarkerSpan(2000, 5000)).toEqual({ min: 2700, max: 5000 })
  })

  it('**거짓 고정형 방지** — 클램프에 한 점으로 뭉개진 범위형을 고정형으로 읽으면 안 된다', () => {
    // 밝기: 기준 400lm 제품의 100~200lm 사양 → 배율 0.25~0.5 → 하한에서 잘려 한 점이 된다.
    expect(brightnessMarkerSpan(400, 100, 200)).toEqual({ min: 0.5, max: 0.5 })
    // 그래도 원본은 범위형이다 — UI는 이쪽으로 판정해야 "400lm 고정형"을 안 찍는다.
    const brightness = specSpan(100, 200)
    expect(brightness).toEqual({ min: 100, max: 200 })
    expect(brightness!.min === brightness!.max).toBe(false)

    // 색온도: 2000~2700K 사양 → 조절 하한 2700K에서 잘려 한 점이 된다.
    expect(colorTempMarkerSpan(2000, 2700)).toEqual({ min: 2700, max: 2700 })
    const colorTemp = specSpan(2000, 2700)
    expect(colorTemp).toEqual({ min: 2000, max: 2700 })
    expect(colorTemp!.min === colorTemp!.max).toBe(false)
  })

  it('진짜 고정형은 원본에서도 min === max다 (lamp-warm 2700K / 400lm)', () => {
    expect(specSpan(2700, 2700)).toEqual({ min: 2700, max: 2700 })
    expect(specSpan(400, 400)).toEqual({ min: 400, max: 400 })
  })

  it('사양 미제공(둘 다 NULL)은 null — 뒤집힌 입력은 정렬해서 받는다', () => {
    expect(specSpan(undefined, undefined)).toBeNull()
    expect(specSpan(3000, undefined)).toBeNull()
    expect(specSpan(undefined, 5700)).toBeNull()
    expect(specSpan(5700, 3000)).toEqual({ min: 3000, max: 5700 })
  })
})
