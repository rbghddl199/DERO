// 작업실 이탈 확인창이 필요한지 판단한다.

// 2026-08-06부터 트리거 종류(로고/나가기 버튼/브라우저 뒤로가기)는 더 이상 이 판단에 관여하지
// 않는다 — 저장 안 한 변경 사항이 있을 때만 뜨고, 없으면 어떤 트리거든 그냥 나간다(사용자 요청:
// "이 외의 경우: 문구가 뜨지 않고 그냥 나갈 수 있게").

export const SIMULATOR_EXIT_REQUEST_EVENT = 'dero:simulator-exit-request';

export type SimulatorExitRequestDetail = {
  href: string;
};

export const requestSimulatorExitNavigation = (href: string): void => {
  window.dispatchEvent(
    new CustomEvent<SimulatorExitRequestDetail>(SIMULATOR_EXIT_REQUEST_EVENT, {
      detail: { href },
    }),
  );
};

export const shouldConfirmSimulatorExit = (hasUnsavedChanges: boolean): boolean =>
  hasUnsavedChanges;

/** 작업실을 나가는(로고·나가기 버튼·브라우저 뒤로가기) 기본 목적지 — 실제 이전 히스토리
 * 엔트리가 무엇이었든 항상 여기로 보낸다(사용자가 명시한 절대 URL, 상대 경로가 아니다). */
export const SIMULATOR_EXIT_DESTINATION_URL = 'https://www.dero.life/craft';
