// GA4 Measurement ID 상수 — 값이 없으면(로컬 개발 등) GA 자체가 비활성.

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';

export const isGaConfigured = (): boolean => GA_MEASUREMENT_ID !== '';
