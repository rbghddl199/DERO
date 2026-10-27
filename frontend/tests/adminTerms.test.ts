// 관리자 약관 메뉴와 두 필수 동의 항목의 DERO 맞춤 초안을 고정한다.

import { describe, expect, it } from 'vitest';
import { ADMIN_NAV_ITEMS } from '@/constants/admin/navigation';
import {
  isManagedTermsCode,
  TERMS_CODES,
  TERMS_DRAFTS,
  TERMS_REQUIRED,
} from '@/constants/admin/termsDrafts';

describe('admin terms', () => {
  it('filters retired agreement codes from revision history', () => {
    const historyCodes = ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'AGE_OVER_14', 'MARKETING'];

    expect(historyCodes.filter(isManagedTermsCode)).toEqual(['TERMS_OF_SERVICE', 'PRIVACY_POLICY']);
  });

  it('관리자 콘솔에 약관 메뉴를 노출한다', () => {
    expect(ADMIN_NAV_ITEMS).toContainEqual(
      expect.objectContaining({ href: '/admin/terms', label: '약관' }),
    );
  });

  it('관리자가 편집할 약관 두 종류를 제공한다', () => {
    expect(TERMS_CODES).toEqual(['TERMS_OF_SERVICE', 'PRIVACY_POLICY']);
    expect(TERMS_REQUIRED).toEqual({
      TERMS_OF_SERVICE: true,
      PRIVACY_POLICY: true,
    });
  });

  it('서비스 이용약관이 DERO 핵심 기능과 제휴·분석 도구의 한계를 명시한다', () => {
    expect(TERMS_DRAFTS.TERMS_OF_SERVICE).toContain('3D 배치·호환성 정보 및 제휴 쇼핑몰의 한계');
    expect(TERMS_DRAFTS.TERMS_OF_SERVICE).toContain('인공지능 기능의 한계');
    expect(TERMS_DRAFTS.TERMS_OF_SERVICE).toContain('커뮤니티 기능');
    expect(TERMS_DRAFTS.TERMS_OF_SERVICE).toContain('Google Analytics, Hotjar');
  });

  it('개인정보 동의 초안에 분석 도구와 수집 거부 방법을 명시한다', () => {
    expect(TERMS_DRAFTS.PRIVACY_POLICY).toContain('Google Analytics');
    expect(TERMS_DRAFTS.PRIVACY_POLICY).toContain('Hotjar');
    expect(TERMS_DRAFTS.PRIVACY_POLICY).toContain('분석 정보 수집 거부 방법');
  });
});
