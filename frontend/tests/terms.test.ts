// 약관 공개 페이지의 슬러그 규칙을 고정한다 — 코드↔슬러그 왕복, 목록 조회, 본문 없는 항목 판별.

import { describe, expect, it } from 'vitest';
import type { TermsResponse } from '@/api/onboarding';
import {
  findTermsBySlug,
  formatTermsEffectiveDate,
  hasTermsContent,
  termsCodeFromSlug,
  termsPagePath,
  termsSlugFromCode,
} from '@/utils/terms';

/** GET /terms 응답 모양 — 항목별 현행 회차 하나씩. AGE_OVER_14는 content_key가 없어 contentUrl이 null. */
const CURRENT_TERMS: TermsResponse[] = [
  {
    id: 152,
    code: 'TERMS_OF_SERVICE',
    revision: 3,
    title: '서비스 이용약관',
    contentUrl: 'https://s3.example.com/terms/152.md?X-Amz-Signature=abc',
    required: true,
    effectiveAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 153,
    code: 'PRIVACY_POLICY',
    revision: 1,
    title: '개인정보 수집·이용 동의',
    contentUrl: 'https://s3.example.com/terms/153.md?X-Amz-Signature=def',
    required: true,
    effectiveAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 154,
    code: 'AGE_OVER_14',
    revision: 1,
    title: '만 14세 이상입니다',
    required: true,
    effectiveAt: '2026-08-01T00:00:00Z',
  },
];

describe('약관 슬러그 변환', () => {
  it('code를 kebab-case 슬러그로 바꾼다', () => {
    expect(termsSlugFromCode('TERMS_OF_SERVICE')).toBe('terms-of-service');
    expect(termsSlugFromCode('PRIVACY_POLICY')).toBe('privacy-policy');
    expect(termsSlugFromCode('AGE_OVER_14')).toBe('age-over-14');
    expect(termsSlugFromCode('MARKETING')).toBe('marketing');
  });

  it('슬러그를 code로 되돌린다', () => {
    expect(termsCodeFromSlug('terms-of-service')).toBe('TERMS_OF_SERVICE');
    expect(termsCodeFromSlug('age-over-14')).toBe('AGE_OVER_14');
  });

  it('code → 슬러그 → code 왕복이 원본과 같다', () => {
    for (const code of ['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'AGE_OVER_14', 'MARKETING']) {
      expect(termsCodeFromSlug(termsSlugFromCode(code))).toBe(code);
    }
  });
});

describe('약관 항목 조회', () => {
  it('슬러그로 현행 회차를 찾는다', () => {
    expect(findTermsBySlug(CURRENT_TERMS, 'terms-of-service')?.id).toBe(152);
    expect(findTermsBySlug(CURRENT_TERMS, 'privacy-policy')?.id).toBe(153);
  });

  it('목록에 없는 슬러그는 null이다 — 호출부가 404로 접는다', () => {
    expect(findTermsBySlug(CURRENT_TERMS, 'marketing')).toBeNull();
    expect(findTermsBySlug(CURRENT_TERMS, 'nope')).toBeNull();
    expect(findTermsBySlug([], 'terms-of-service')).toBeNull();
  });
});

describe('본문 유무 판별', () => {
  it('contentUrl이 있는 항목만 본문이 있다', () => {
    expect(hasTermsContent(CURRENT_TERMS[0])).toBe(true);
    expect(hasTermsContent(CURRENT_TERMS[2])).toBe(false);
    expect(hasTermsContent({ code: 'MARKETING', contentUrl: '' })).toBe(false);
  });

  it('본문이 있는 항목만 페이지 경로를 가진다', () => {
    expect(termsPagePath(CURRENT_TERMS[0])).toBe('/terms/terms-of-service');
    expect(termsPagePath(CURRENT_TERMS[2])).toBeNull();
  });

  it('code가 없으면 경로를 만들지 않는다', () => {
    expect(termsPagePath({ contentUrl: 'https://s3.example.com/x.md' })).toBeNull();
  });
});

describe('시행일 표기', () => {
  it('KST 날짜로 표기한다 — UTC 자정은 한국에서 다음 날이다', () => {
    expect(formatTermsEffectiveDate('2026-08-01T00:00:00Z')).toBe('2026년 8월 1일');
    expect(formatTermsEffectiveDate('2026-07-31T15:00:00Z')).toBe('2026년 8월 1일');
  });
});
