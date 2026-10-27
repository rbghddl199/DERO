'use client';
// 상세 페이지 뒤로 가기 — 브라우저 히스토리로 복귀, 직접 진입 시 fallbackHref로 대체 이동

import { useRouter } from 'next/navigation';

type Props = {
  fallbackHref: string;
  /** 목록이 명시한 복귀 경로. 있으면 오래된 브라우저 히스토리보다 우선한다. */
  returnHref?: string | null;
};

const BackButton = ({ fallbackHref, returnHref = null }: Props) => {
  const router = useRouter();

  const handleClick = () => {
    if (returnHref !== null) {
      // 상세 엔트리를 목록으로 교체해, 복귀 직후 브라우저 뒤로가기가 다시 같은 상세로 되돌아가는
      // 왕복을 만들지 않는다.
      router.replace(returnHref);
      return;
    }
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-ash hover:text-ink flex items-center gap-1 text-[14px] transition-colors"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M10 3.5 5.5 8l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      뒤로 가기
    </button>
  );
};

export default BackButton;
