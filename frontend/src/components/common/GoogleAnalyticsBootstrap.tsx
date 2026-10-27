'use client';
// GA4 스크립트 마운트 — 쿠키 동의 전에는 스크립트 자체가 DOM에 없다(동의 없으면 쿠키 없음).

import { GoogleAnalytics } from '@next/third-parties/google';
import { GA_MEASUREMENT_ID, isGaConfigured } from '@/constants/analytics';
import { useCookieConsentStore } from '@/store/cookieConsentStore';

const GoogleAnalyticsBootstrap = () => {
  const decision = useCookieConsentStore((state) => state.decision);

  if (!isGaConfigured() || decision !== 'accepted') return null;

  return <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />;
};

export default GoogleAnalyticsBootstrap;
