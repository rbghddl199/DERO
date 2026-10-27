// 쿠키 동의 스토어 — setDecision이 저장한 값을 그대로 읽어온다.
import { beforeEach, describe, expect, it } from 'vitest';
import { useCookieConsentStore } from '@/store/cookieConsentStore';

describe('cookieConsentStore', () => {
  beforeEach(() => {
    useCookieConsentStore.setState({ decision: null });
  });

  it('초기값은 null이다(아직 결정 전)', () => {
    expect(useCookieConsentStore.getState().decision).toBeNull();
  });

  it('setDecision은 결정을 그대로 반영한다', () => {
    useCookieConsentStore.getState().setDecision('accepted');
    expect(useCookieConsentStore.getState().decision).toBe('accepted');

    useCookieConsentStore.getState().setDecision('declined');
    expect(useCookieConsentStore.getState().decision).toBe('declined');
  });
});
