// GA4 커스텀 이벤트 전송 — 동의 전이거나 GA 미설정이면 조용히 no-op한다.

import { sendGAEvent } from '@next/third-parties/google';
import { isGaConfigured } from '@/constants/analytics';
import { useCookieConsentStore } from '@/store/cookieConsentStore';

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!isGaConfigured() || useCookieConsentStore.getState().decision !== 'accepted') return;
  sendGAEvent('event', name, params ?? {});
}
