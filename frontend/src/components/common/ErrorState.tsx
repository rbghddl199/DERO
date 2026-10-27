// 공통 오류 설명과 선택적 재시도 Action을 스크린리더가 즉시 식별할 수 있게 표시한다.

import { useId } from 'react';

export type ErrorStateProps = {
  description: string;
  title?: string;
  retryLabel?: string;
  retryDisabled?: boolean;
  onRetry?: () => void;
};

const ErrorState = ({
  description,
  title = '문제가 발생했습니다',
  retryLabel = '다시 시도',
  retryDisabled = false,
  onRetry,
}: ErrorStateProps) => {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <section
      role="alert"
      aria-live="assertive"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="border-danger-500/20 bg-danger-50 flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border px-6 py-10 text-center shadow-lg"
    >
      <div
        aria-hidden="true"
        className="text-danger-700 mb-4 flex size-12 items-center justify-center rounded-full bg-white text-2xl font-semibold"
      >
        !
      </div>
      <h2 id={titleId} className="text-xl font-semibold text-neutral-800">
        {title}
      </h2>
      <p id={descriptionId} className="mt-2 max-w-xl text-[15px] leading-6 text-neutral-700">
        {description}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          className="bg-primary-500 hover:bg-primary-600 focus-visible:outline-primary-600 mt-5 min-h-11 rounded-xl px-5 py-2.5 text-[15px] font-semibold text-neutral-900 transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {retryLabel}
        </button>
      ) : null}
    </section>
  );
};

export default ErrorState;
