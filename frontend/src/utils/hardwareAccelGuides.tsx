// 하드웨어 가속 안내 문구 — 브라우저별 설정 경로 + 안내 텍스트. 시뮬레이터 HUD의
// HardwareAccelDialog(three/bootstrap/style.css 클래스 기반, /simulator 전용)와
// /craft·/collection의 SimulatorEntryWarningDialog(Tailwind 기반, 시뮬레이터 진입 전 경고)가
// 이 데이터를 함께 쓴다 — 안내 문구가 두 군데에서 갈라지지 않게 한 곳에 둔다.

import type { ReactNode } from 'react';
import type { BrowserKind } from './hardwareAcceleration';

export type BrowserGuide = {
  kind: Exclude<BrowserKind, 'other'>;
  label: string;
  /** 주소창에 붙여넣을 설정 페이지 주소 — 웹 페이지에서 window.open으로는 못 연다. */
  address: string;
  steps: ReactNode;
};

export const BROWSER_GUIDES: BrowserGuide[] = [
  {
    kind: 'chrome',
    label: 'Chrome',
    address: 'chrome://settings/system',
    steps: (
      <>
        &apos;가능한 경우 그래픽 가속 사용&apos; 토글을 켜거나 끈 뒤{' '}
        <strong>&apos;다시 시작&apos;</strong>을 누르세요.
      </>
    ),
  },
  {
    kind: 'edge',
    label: 'Edge',
    address: 'edge://settings/system',
    steps: (
      <>
        &apos;사용 가능한 경우 그래픽 가속 사용&apos; 토글을 켜거나 끈 뒤 브라우저를{' '}
        <strong>재시작</strong>하세요.
      </>
    ),
  },
  {
    kind: 'firefox',
    label: 'Firefox',
    address: 'about:preferences#general',
    steps: (
      <>
        &apos;성능&apos; 항목에서 &apos;권장 성능 설정 사용&apos;을 해제하면 나오는 &apos;하드웨어
        가속이 가능하면 사용&apos;을 켜거나 끄고 <strong>재시작</strong>하세요.
      </>
    ),
  },
];

/** 지금 쓰는 브라우저의 안내를 맨 앞으로 — 판별 불가('other')면 원래 순서 그대로. */
export function sortGuidesByCurrentBrowser(browserKind: BrowserKind): BrowserGuide[] {
  return [...BROWSER_GUIDES].sort(
    (a, b) => Number(b.kind === browserKind) - Number(a.kind === browserKind),
  );
}
