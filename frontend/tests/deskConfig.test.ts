import { describe, it, expect } from 'vitest';
import {
  DESK_RANGE,
  DEFAULT_CUSTOM_DESK,
  deskMaterialSkin,
  deskSkinForTextureId,
  deskTextureSkin,
  validateCustomDesk,
  deskConfigFromProduct,
  type DeskConfig,
} from '../src/three/core/deskConfig';
import type { DeskTexturePublicResponse } from '../src/types/catalog';
import { getProduct } from '../src/three/scene/product';

const base: DeskConfig = { ...DEFAULT_CUSTOM_DESK };

describe('DESK_RANGE', () => {
  // 수치 정본은 deskConfig.ts다 — 3d-scene.md는 수치를 더 이상 들고 있지 않고, min 100은
  // 29135b1(2026-07-30, 마법사 1단계 미리보기)에서 의도적으로 넓힌 값이다.
  it('deskConfig.ts 정본 수치와 일치한다', () => {
    expect(DESK_RANGE.widthMm).toEqual({ min: 100, max: 3000, default: 1400, step: 10 });
    expect(DESK_RANGE.depthMm).toEqual({ min: 100, max: 1200, default: 700, step: 10 });
    expect(DESK_RANGE.heightMm).toEqual({ min: 550, max: 1300, default: 740, step: 5 });
    expect(DESK_RANGE.topThicknessMm).toEqual({ min: 10, max: 80, default: 25, step: 1 });
  });

  it('기본 커스텀 설정은 범위 기본값을 쓴다', () => {
    expect(DEFAULT_CUSTOM_DESK.source).toBe('custom');
    expect(DEFAULT_CUSTOM_DESK.widthMm).toBe(1400);
    expect(DEFAULT_CUSTOM_DESK.depthMm).toBe(700);
    expect(DEFAULT_CUSTOM_DESK.heightMm).toBe(740);
    expect(DEFAULT_CUSTOM_DESK.topThicknessMm).toBe(25);
  });
});

describe('validateCustomDesk', () => {
  it('범위 안 값은 통과한다', () => {
    expect(validateCustomDesk(base)).toEqual({ ok: true, errors: [] });
  });

  it('하한 미만은 거부하고 어떤 필드인지 알려준다', () => {
    const r = validateCustomDesk({ ...base, widthMm: 99 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.key === 'widthMm')).toBe(true);
  });

  it('상한 초과는 거부한다', () => {
    expect(validateCustomDesk({ ...base, depthMm: 1201 }).ok).toBe(false);
    expect(validateCustomDesk({ ...base, heightMm: 1301 }).ok).toBe(false);
    expect(validateCustomDesk({ ...base, topThicknessMm: 81 }).ok).toBe(false);
  });

  it('경계값은 포함이다', () => {
    expect(validateCustomDesk({ ...base, widthMm: 100 }).ok).toBe(true);
    expect(validateCustomDesk({ ...base, widthMm: 3000 }).ok).toBe(true);
  });

  it('여러 필드가 동시에 틀리면 오류도 여러 개다', () => {
    const r = validateCustomDesk({ ...base, widthMm: 10, heightMm: 10 });
    expect(r.errors.length).toBe(2);
  });

  it('숫자가 아닌 값은 거부한다', () => {
    expect(validateCustomDesk({ ...base, widthMm: Number.NaN }).ok).toBe(false);
  });
});

describe('deskMaterialSkin', () => {
  it('원목 2종은 wood 클래스다', () => {
    expect(deskMaterialSkin({ materialId: 'walnut' }).class).toBe('wood');
    expect(deskMaterialSkin({ materialId: 'oak' }).class).toBe('wood');
  });

  it('월넛이 오크보다 어둡다', () => {
    expect(deskMaterialSkin({ materialId: 'walnut' }).baseColor).toBeLessThan(
      deskMaterialSkin({ materialId: 'oak' }).baseColor,
    );
  });

  it('블랙·화이트는 라미네이트(plastic) 클래스다', () => {
    expect(deskMaterialSkin({ materialId: 'black' }).class).toBe('plastic');
    expect(deskMaterialSkin({ materialId: 'white' }).class).toBe('plastic');
  });

  it('4종 모두 서로 다른 baseColor를 갖는다', () => {
    const ids = ['walnut', 'oak', 'black', 'white'] as const;
    const colors = new Set(ids.map((i) => deskMaterialSkin({ materialId: i }).baseColor));
    expect(colors.size).toBe(4);
  });

  it('materialSkin이 있으면 materialId보다 우선한다(실 카탈로그 desk_texture 재질)', () => {
    const skin = deskMaterialSkin({
      materialId: 'oak',
      materialSkin: { class: 'wood', baseColor: 0x123456, roughness: 0.4, metalness: 0 },
    });
    expect(skin.baseColor).toBe(0x123456);
  });
});

describe('deskConfigFromProduct', () => {
  it('제품 규격을 그대로 옮기고 source=product로 표시한다', () => {
    const spec = getProduct('desk-oak-1200')!;
    const cfg = deskConfigFromProduct(spec);
    expect(cfg.source).toBe('product');
    expect(cfg.productId).toBe('desk-oak-1200');
    expect(cfg.widthMm).toBe(spec.widthMm);
    expect(cfg.depthMm).toBe(spec.depthMm);
    expect(cfg.heightMm).toBe(spec.heightMm);
    expect(cfg.topThicknessMm).toBe(spec.topThicknessMm);
  });

  it('제품의 재질·프레임을 그대로 가져온다', () => {
    const cfg = deskConfigFromProduct(getProduct('desk-walnut-1400')!);
    expect(cfg.materialId).toBe('walnut');
    expect(cfg.frameType).toBe('t-frame');
  });
});

// GET /desk-textures 응답 -> 렌더 스킨 (DERO-335). 옛 DESK_TEXTURE_ID_TO_MATERIAL
// 임시표는 시딩 2행(오크 id=1, 월넛 id=51) 밖의 재질을 전부 'oak'로 뭉갰다 — 그게 안 재발하는지가
// 이 describe의 핵심이다.
describe('deskTextureSkin', () => {
  function texture(overrides: Partial<DeskTexturePublicResponse> = {}): DeskTexturePublicResponse {
    return {
      id: 1,
      name: '오크',
      baseColor: '#b8895a',
      albedoUrl: null,
      roughnessUrl: null,
      normalUrl: null,
      roughness: 0.55,
      metalness: 0,
      tileSizeMm: null,
      displayOrder: 0,
      ...overrides,
    };
  }

  it('baseColor 16진 문자열과 거칠기·금속성을 그대로 스킨으로 옮긴다', () => {
    const skin = deskTextureSkin(texture({ baseColor: '#123456', roughness: 0.3, metalness: 0.7 }));
    expect(skin).toEqual({ class: 'wood', baseColor: 0x123456, roughness: 0.3, metalness: 0.7 });
  });

  it('baseColor가 #rrggbb 형식이 아니면 오크 색으로 떨어진다', () => {
    expect(deskTextureSkin(texture({ baseColor: 'chestnut' })).baseColor).toBe(0xb8895a);
    expect(deskTextureSkin(texture({ baseColor: '#abc' })).baseColor).toBe(0xb8895a);
  });
});

describe('deskSkinForTextureId', () => {
  const textures: DeskTexturePublicResponse[] = [
    {
      id: 1,
      name: '오크',
      baseColor: '#b8895a',
      albedoUrl: null,
      roughnessUrl: null,
      normalUrl: null,
      roughness: 0.55,
      metalness: 0,
      tileSizeMm: null,
      displayOrder: 0,
    },
    // 시딩 2행 너머의 재질 — 관리자가 나중에 추가한 행을 흉내낸다.
    {
      id: 777,
      name: '유광 화이트',
      baseColor: '#eceae5',
      albedoUrl: 'https://example.test/albedo.ktx2',
      roughnessUrl: null,
      normalUrl: null,
      roughness: 0.12,
      metalness: 0.4,
      tileSizeMm: 600,
      displayOrder: 9,
    },
  ];

  it('시딩 2행 너머의 재질도 자기 색·거칠기로 렌더된다', () => {
    expect(deskSkinForTextureId(textures, 777)).toEqual({
      class: 'wood',
      baseColor: 0xeceae5,
      roughness: 0.12,
      metalness: 0.4,
    });
  });

  it('목록에 있는 재질은 오크 폴백을 타지 않는다', () => {
    expect(deskSkinForTextureId(textures, 1).baseColor).toBe(0xb8895a);
  });

  it('모르는 id·빈 목록(로드 실패)은 오크 톤으로 떨어진다', () => {
    expect(deskSkinForTextureId(textures, 999).baseColor).toBe(0xb8895a);
    expect(deskSkinForTextureId([], 777).baseColor).toBe(0xb8895a);
  });

  it('만든 스킨은 deskMaterialSkin에서 materialId보다 우선한다', () => {
    const skin = deskSkinForTextureId(textures, 777);
    expect(deskMaterialSkin({ materialId: 'oak', materialSkin: skin })).toBe(skin);
  });
});
