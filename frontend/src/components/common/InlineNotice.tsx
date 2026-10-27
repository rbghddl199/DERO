// 공통 인라인 안내를 의미별 아이콘·색상·live region으로 구분해 표시한다.

import { useId } from 'react';

export type InlineNoticeVariant = 'info' | 'success' | 'warning' | 'error';

export type InlineNoticeProps = {
  message: string;
  title?: string;
  variant?: InlineNoticeVariant;
};

const NOTICE_CLASS: Record<InlineNoticeVariant, string> = {
  info: 'border-primary-500/25 bg-primary-50 text-primary-900',
  success: 'border-success-500/25 bg-success-50 text-success-700',
  warning: 'border-warning-500/25 bg-warning-50 text-warning-700',
  error: 'border-danger-500/25 bg-danger-50 text-danger-700',
};

const NOTICE_ICON: Record<InlineNoticeVariant, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  error: '×',
};

const NOTICE_LABEL: Record<InlineNoticeVariant, string> = {
  info: '정보',
  success: '성공',
  warning: '주의',
  error: '오류',
};

const InlineNotice = ({ message, title, variant = 'info' }: InlineNoticeProps) => {
  const titleId = useId();
  const messageId = useId();
  const isUrgent = variant === 'warning' || variant === 'error';

  return (
    <aside
      role={isUrgent ? 'alert' : 'status'}
      aria-live={isUrgent ? 'assertive' : 'polite'}
      aria-atomic="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={messageId}
      data-variant={variant}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-[15px] leading-6 ${NOTICE_CLASS[variant]}`}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-current text-[13px] font-bold"
      >
        {NOTICE_ICON[variant]}
      </span>
      <div className="min-w-0">
        <span className="sr-only">{NOTICE_LABEL[variant]}: </span>
        {title ? (
          <h2 id={titleId} className="font-semibold">
            {title}
          </h2>
        ) : null}
        <p id={messageId} className={title ? 'mt-0.5' : undefined}>
          {message}
        </p>
      </div>
    </aside>
  );
};

export default InlineNotice;
