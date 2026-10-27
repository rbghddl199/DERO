// 온보딩 2단계 — 약관 동의. GET /terms 결과로 그리고, 필수를 다 체크해야 제출이 열린다.
// "보기"는 presigned contentUrl을 직접 열지 않고 /terms/[slug] 페이지를 새 탭으로 띄운다(TTL 15분 노출 방지).

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { fetchTerms, submitConsents, type TermsResponse } from '@/api/onboarding';
import ErrorState from '@/components/common/ErrorState';
import InlineNotice from '@/components/common/InlineNotice';
import LoadingState from '@/components/common/LoadingState';
import { canSubmitConsents, checkedTermsIds } from '@/utils/auth/onboarding';
import { termsPagePath } from '@/utils/terms';

export type TermsStepProps = {
  onAgreed: () => void;
};

const TermsStep = ({ onAgreed }: TermsStepProps) => {
  const [terms, setTerms] = useState<TermsResponse[] | null>(null);
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<number>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // 이펙트 본문에서 동기로 setState하면 React Compiler 린트가 막는다(cascading render) —
  // 오류 초기화는 재시도 핸들러가 한다.
  useEffect(() => {
    let isActive = true;
    fetchTerms()
      .then((loaded) => {
        if (isActive) {
          setTerms(loaded);
        }
      })
      .catch(() => {
        if (isActive) {
          setLoadError('약관을 불러오지 못했습니다.');
        }
      });
    return () => {
      isActive = false;
    };
  }, [reloadToken]);

  if (loadError !== null) {
    return (
      <ErrorState
        title="약관을 불러오지 못했습니다"
        description="네트워크 상태를 확인하고 다시 시도해 주세요."
        retryLabel="다시 시도"
        onRetry={() => {
          setLoadError(null);
          setReloadToken((token) => token + 1);
        }}
      />
    );
  }

  if (terms === null) {
    return <LoadingState label="약관 불러오는 중" description="동의 항목을 준비하고 있습니다." />;
  }

  const canSubmit = canSubmitConsents(terms, checkedIds);
  const isAllChecked =
    terms.length > 0 && terms.every((item) => item.id !== undefined && checkedIds.has(item.id));

  const toggle = (termsId: number) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(termsId)) {
        next.delete(termsId);
      } else {
        next.add(termsId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    setCheckedIds(
      isAllChecked
        ? new Set()
        : new Set(terms.map((item) => item.id).filter((id): id is number => id !== undefined)),
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // 요청은 한 번이다 — 항목별로 부르면 중간에 끊긴 부분 동의가 남는다.
      await submitConsents(checkedTermsIds(terms, checkedIds));
      onAgreed();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '동의를 저장하지 못했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div data-onboarding-step="terms" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-ink text-[22px] font-bold">약관에 동의해 주세요</h1>
        <p className="text-ash text-[14px] leading-6">
          필수 항목에 모두 동의해야 서비스를 시작할 수 있습니다.
        </p>
      </header>

      <button
        type="button"
        onClick={toggleAll}
        className="border-ash/40 text-ink rounded-xl border px-4 py-3 text-left text-[15px] font-semibold"
      >
        <span aria-hidden="true">{isAllChecked ? '☑' : '☐'}</span> 전체 동의
      </button>

      <ul className="flex flex-col gap-2">
        {terms.map((item) => {
          // 본문이 없는 항목(AGE_OVER_14)은 null — "보기" 링크를 렌더하지 않는다.
          const contentPath = termsPagePath(item);
          return (
            <li key={item.id}>
              <label className="flex items-center gap-3 px-1 py-2 text-[15px]">
                <input
                  type="checkbox"
                  checked={item.id !== undefined && checkedIds.has(item.id)}
                  onChange={() => {
                    if (item.id !== undefined) {
                      toggle(item.id);
                    }
                  }}
                  className="size-5"
                />
                <span className="text-ink">
                  <span className={item.required ? 'text-danger-700' : 'text-ash'}>
                    [{item.required ? '필수' : '선택'}]
                  </span>{' '}
                  {item.title}
                </span>
                {contentPath !== null ? (
                  <Link
                    href={contentPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ash ml-auto text-[13px] underline"
                  >
                    보기
                  </Link>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>

      {submitError ? <InlineNotice variant="error" message={submitError} /> : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isSubmitting}
        className="bg-primary-500 hover:bg-primary-600 rounded-xl px-4 py-3 text-[15px] font-semibold text-white transition-colors disabled:opacity-40"
      >
        {isSubmitting ? '저장 중…' : '동의하고 시작하기'}
      </button>
    </div>
  );
};

export default TermsStep;
