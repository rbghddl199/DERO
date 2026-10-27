// 데스크피드 제품 레일 앵커 선택 — 어느 사진에 매달지(임계·히스테리시스·경합)가 규약이다.
// 붙어 다니는 자리 계산은 CSS sticky가 하므로 여기서 클램프하지 않는다(DERO-630).

import { describe, expect, it } from 'vitest';
import { pickRailAnchor, type RailPhotoRect } from '@/utils/deskFeedRailAnchor';

const VH = 900;
const photo = (key: string, top: number, height = 500): RailPhotoRect => ({
  key,
  top,
  bottom: top + height,
  height,
});

describe('pickRailAnchor', () => {
  const pick = (photos: RailPhotoRect[], shownKey: string | null = null) =>
    pickRailAnchor(photos, { viewportHeight: VH, shownKey });

  it('보는 사진의 상단·높이를 그대로 답한다 — 클램프는 sticky가 한다', () => {
    expect(pick([photo('a', 400)])).toEqual({ key: 'a', top: 400, height: 500 });
  });

  it('사진이 천장 위로 올라가도 그 사진을 유지한다', () => {
    // 700px 사진의 위 500px이 천장(112px) 위로 빠져나갔고 아래로 충분히 남았다.
    expect(pick([photo('a', -300, 700)])).toEqual({ key: 'a', top: -300, height: 700 });
  });

  it('사진이 완전히 가려지면 고를 사진이 없다 — 직전 사진을 그대로 두라는 뜻', () => {
    expect(pick([photo('a', -600)], 'a')).toBeNull();
    expect(pick([photo('a', VH + 10)], 'a')).toBeNull();
  });

  it('새 사진은 일정 크기 이상 보여야 갈아탄다', () => {
    // 500px 사진의 임계는 125px — 화면 아래로 100px만 들어온 사진은 아직 안 고른다.
    expect(pick([photo('a', VH - 100)])).toBeNull();
    expect(pick([photo('a', VH - 130)])?.key).toBe('a');
  });

  it('보고 있던 사진은 임계 아래로 줄어도 유지한다', () => {
    expect(pick([photo('a', VH - 100)], 'a')?.key).toBe('a');
  });

  it('두 장이 걸쳐 있으면 더 많이 보이는 쪽으로 갈아탄다', () => {
    // a는 천장 아래로 40px만 남았고 b가 화면을 차지한다 — 보고 있던 것이 a라도 b로 넘긴다.
    const a = photo('a', 112 - 460);
    const b = photo('b', 240);
    expect(pick([a, b], 'a')?.key).toBe('b');
  });

  it('아주 긴 사진도 화면에 200px 들어오면 고른다', () => {
    expect(pick([photo('tall', VH - 210, 4000)])?.key).toBe('tall');
  });

  it('본문에 사진이 없으면 앵커가 없다', () => {
    expect(pick([])).toBeNull();
  });
});
