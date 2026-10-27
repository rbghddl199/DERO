// GA4 커스텀 이벤트 helper — GA 미설정이거나 동의 전이면 sendGAEvent를 부르지 않는다.
// GA_MEASUREMENT_ID가 모듈 로드 시점 값이라 productLikesStore.test.ts와 같이
// vi.stubEnv + resetModules로 매번 새로 import한다.
import { afterEach, describe, expect, it, vi } from 'vitest';

const sendGAEventMock = vi.fn();

vi.mock('@next/third-parties/google', () => ({
  sendGAEvent: sendGAEventMock,
}));

const loadAnalytics = async (gaId: string) => {
  vi.stubEnv('NEXT_PUBLIC_GA_ID', gaId);
  vi.resetModules();
  const { trackEvent } = await import('@/utils/analytics');
  const { useCookieConsentStore } = await import('@/store/cookieConsentStore');
  return { trackEvent, useCookieConsentStore };
};

describe('trackEvent', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    sendGAEventMock.mockReset();
  });

  it('GA_MEASUREMENT_ID가 없으면 동의해도 이벤트를 보내지 않는다', async () => {
    const { trackEvent, useCookieConsentStore } = await loadAnalytics('');
    useCookieConsentStore.getState().setDecision('accepted');

    trackEvent('sign_up', { method: 'onboarding' });

    expect(sendGAEventMock).not.toHaveBeenCalled();
  });

  it('동의 전이면 GA가 설정돼 있어도 이벤트를 보내지 않는다', async () => {
    const { trackEvent, useCookieConsentStore } = await loadAnalytics('G-TEST123');
    useCookieConsentStore.getState().setDecision('declined');

    trackEvent('sign_up', { method: 'onboarding' });

    expect(sendGAEventMock).not.toHaveBeenCalled();
  });

  it('GA 설정 + 동의 상태면 sendGAEvent를 그대로 전달한다', async () => {
    const { trackEvent, useCookieConsentStore } = await loadAnalytics('G-TEST123');
    useCookieConsentStore.getState().setDecision('accepted');

    trackEvent('craft_saved', { mode: 'create' });

    expect(sendGAEventMock).toHaveBeenCalledWith('event', 'craft_saved', { mode: 'create' });
  });
});
