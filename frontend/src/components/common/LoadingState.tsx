// 공통 비동기 작업의 진행 상태와 선택적 설명을 접근 가능한 상태 영역으로 표시한다.

import { useId } from 'react';

export type LoadingStateProps = {
  label?: string;
  description?: string;
};

const LoadingState = ({ label = '불러오는 중', description }: LoadingStateProps) => {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <section
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      className="flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border border-white/80 bg-white/75 px-6 py-10 text-center shadow-lg backdrop-blur-[12px]"
    >
      <svg
        viewBox="0 0 48 48"
        aria-hidden="true"
        className="text-primary-500 mb-4 size-11 animate-spin motion-reduce:animate-none"
      >
        <circle
          cx="24"
          cy="24"
          r="19"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          opacity="0.2"
        />
        <path
          d="M24 5a19 19 0 0 1 19 19"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="4"
        />
      </svg>
      <h2 id={labelId} className="text-xl font-semibold text-neutral-800">
        {label}
      </h2>
      {description ? (
        <p id={descriptionId} className="mt-2 text-[15px] leading-6 text-neutral-600">
          {description}
        </p>
      ) : null}
    </section>
  );
};

export default LoadingState;
