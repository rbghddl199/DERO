// 글 링크 공유 — 클립보드 복사가 기본이고, 쓸 수 없으면 Web Share 시트로 넘어간다.
//
// `navigator.clipboard`는 **보안 컨텍스트(https·localhost)에서만 존재한다** — http로 붙은 사내
// 확인용 주소에서는 undefined라 폴백이 없으면 버튼이 조용히 죽는다.
// 공유 시트를 사용자가 닫으면 `AbortError`로 거절되는데 이건 정상 동작이라 실패와 구분한다.

export type ShareOutcome = 'copied' | 'shared' | 'cancelled' | 'failed';

export const shareLink = async (url: string, title: string): Promise<ShareOutcome> => {
  if (navigator.clipboard !== undefined) {
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      // 권한 거부·비활성 문서 — 아래 Web Share로 한 번 더 시도한다.
    }
  }
  if (navigator.share !== undefined) {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (error) {
      return error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed';
    }
  }
  return 'failed';
};
