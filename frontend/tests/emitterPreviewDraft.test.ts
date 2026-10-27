import { describe, it, expect } from 'vitest';
import { EMPTY_EMITTER_DRAFT } from '../src/constants/admin/asset';
import { emitterPreviewFromDraft } from '../src/utils/admin/assetDraft';
import type { EmitterDraft } from '../src/types/admin/asset';

const draft = (over: Partial<EmitterDraft>): EmitterDraft => ({
  ...EMPTY_EMITTER_DRAFT,
  shape: 'POINT',
  lumens: '40',
  radiusMm: '450',
  ...over,
});

describe('emitterPreviewFromDraft', () => {
  it('returns null until the values the renderer needs are all present', () => {
    expect(emitterPreviewFromDraft(EMPTY_EMITTER_DRAFT)).toBeNull();
    expect(emitterPreviewFromDraft(draft({ shape: '' }))).toBeNull();
    expect(emitterPreviewFromDraft(draft({ lumens: '' }))).toBeNull();
    expect(emitterPreviewFromDraft(draft({ radiusMm: '' }))).toBeNull();
    expect(emitterPreviewFromDraft(draft({ radiusMm: '0' }))).toBeNull();
    expect(emitterPreviewFromDraft(draft({ lumens: 'abc' }))).toBeNull();
  });

  it('parses the renderable values without waiting for save-time validation', () => {
    // recolorable 미선택은 저장을 막지만 프리뷰는 막지 않는다 — 답하는 질문이 다르다.
    const preview = emitterPreviewFromDraft(draft({ defaultColor: '#33CCFF' }));
    expect(preview).toEqual({
      shape: 'POINT',
      distribution: null,
      lumens: 40,
      radiusMm: 450,
      colorHex: 0x33ccff,
      pointMm: null,
    });
  });

  it('falls back to white on a half-typed colour instead of flashing black', () => {
    expect(emitterPreviewFromDraft(draft({ defaultColor: '#ff' }))?.colorHex).toBe(0xffffff);
    expect(emitterPreviewFromDraft(draft({ defaultColor: '' }))?.colorHex).toBe(0xffffff);
  });

  it('carries the distribution only for SPOT (POINT has no cone to narrow)', () => {
    expect(
      emitterPreviewFromDraft(draft({ shape: 'SPOT', distribution: 'FLOOD' }))?.distribution,
    ).toBe('FLOOD');
    expect(
      emitterPreviewFromDraft(draft({ shape: 'POINT', distribution: 'FLOOD' }))?.distribution,
    ).toBeNull();
    expect(
      emitterPreviewFromDraft(draft({ shape: 'SPOT', distribution: '' }))?.distribution,
    ).toBeNull();
  });

  it('uses the authored point only when all three axes are filled (else bbox centre)', () => {
    expect(
      emitterPreviewFromDraft(draft({ pointXMm: '0', pointYMm: '120', pointZMm: '-30' }))?.pointMm,
    ).toEqual({ x: 0, y: 120, z: -30 });
    expect(
      emitterPreviewFromDraft(draft({ pointXMm: '0', pointYMm: '120', pointZMm: '' }))?.pointMm,
    ).toBeNull();
  });
});
