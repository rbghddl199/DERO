'use client';
// 3D 에셋 검수 큐 — status=PENDING 고정 목록. 행을 펼쳐 상세를 확인하고 승인·반려한다(반려는 사유 필수).

import { useEffect, useState } from 'react';

import {
  listAdminProducts,
  reviewAdminProduct,
  type AdminProductSummaryResponse,
} from '@/api/admin/products';
import { ApiError } from '@/api/client';
import RejectReasonDialog from '@/components/admin/reviews/RejectReasonDialog';
import ReviewProductDetail from '@/components/admin/reviews/ReviewProductDetail';
import ErrorState from '@/components/common/ErrorState';
import InlineNotice from '@/components/common/InlineNotice';
import LoadingState from '@/components/common/LoadingState';
import Toast from '@/components/common/Toast';
import { PRODUCT_SOURCE_LABEL, SPEC_TYPE_LABEL } from '@/constants/admin/productLabels';

const QUEUE_SIZE = 100;

const toErrorMessage = (cause: unknown): string =>
  cause instanceof ApiError ? cause.message : '네트워크 오류로 요청을 완료하지 못했습니다.';

// 응답을 그게 속한 요청 토큰과 함께 담는다 — 이펙트 본문에서 동기로 초기화하면
// react-hooks/set-state-in-effect가 막으므로, "토큰이 안 맞으면 아직 로딩"으로 렌더 중에 판단한다.
type LoadedQueue = {
  token: number;
  items: AdminProductSummaryResponse[] | null;
  error: string | null;
};

const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 12 12"
    fill="none"
    className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
    aria-hidden="true"
  >
    <path
      d="M2.5 4.5 6 8l3.5-3.5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ReviewPanel = () => {
  const [loaded, setLoaded] = useState<LoadedQueue | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminProductSummaryResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    listAdminProducts({ status: 'PENDING', size: QUEUE_SIZE })
      .then((response) => {
        if (!cancelled) {
          setLoaded({ token: reloadToken, items: response.content ?? [], error: null });
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoaded({ token: reloadToken, items: null, error: toErrorMessage(cause) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const reload = (): void => setReloadToken((token) => token + 1);

  const submitReview = async (
    productId: number,
    result: 'APPROVED' | 'REJECTED',
    note?: string,
  ): Promise<void> => {
    if (submittingId !== null) return;

    setSubmittingId(productId);
    setActionError(null);
    try {
      await reviewAdminProduct(productId, { result, note });
      setRejectTarget(null);
      setExpandedId(null);
      setToastMessage(result === 'APPROVED' ? '승인했습니다.' : '반려했습니다.');
      reload();
    } catch (cause: unknown) {
      setActionError(toErrorMessage(cause));
    } finally {
      setSubmittingId(null);
    }
  };

  // 파생 상태라 렌더 중에 계산한다 — 모달 렌더 조건과 콜백이 같은 좁혀진 id를 쓰고,
  // 목록은 지금 토큰의 응답만 인정한다(그 전 응답은 아직 로딩으로 본다).
  const rejectTargetId = rejectTarget?.id;
  const current = loaded !== null && loaded.token === reloadToken ? loaded : null;
  const items = current?.items ?? null;
  const loadError = current?.error ?? null;

  return (
    <div>
      <h1 className="text-ink text-[28px] font-bold">검수 대기</h1>
      <p className="text-ash mt-2 text-[15px]">
        사용자가 올린 3D 에셋(GLB)이 검수를 기다리는 목록입니다. 행을 펼쳐 규격과 이미지를 확인한 뒤
        승인하거나 반려하세요.
      </p>
      <p className="text-ash mt-2 text-[13px] leading-5">
        승인은 &lsquo;운영진이 봤다&rsquo;는 뜻이지 실측을 보증하는 게 아닙니다. 자작 제품(출처:
        사용자 자작)은 규격이 자기신고라 승인한 뒤에도 상세·배치 화면에 미인증 경고가 계속
        표시됩니다.
      </p>

      {actionError !== null && (
        <div className="mt-6">
          <InlineNotice variant="error" message={actionError} />
        </div>
      )}

      {loadError !== null && (
        <div className="mt-8">
          <ErrorState
            description={loadError}
            title="검수 목록을 불러오지 못했습니다"
            onRetry={reload}
          />
        </div>
      )}

      {loadError === null && items === null && (
        <div className="mt-8">
          <LoadingState label="검수 목록 불러오는 중" />
        </div>
      )}

      {loadError === null && items !== null && items.length === 0 && (
        <p className="border-ash/20 text-ash mt-8 rounded-2xl border border-dashed px-6 py-16 text-center text-[15px]">
          검수를 기다리는 제품이 없습니다.
        </p>
      )}

      {loadError === null && items !== null && items.length > 0 && (
        <ul className="mt-8 flex flex-col gap-3">
          {items.map((item) => {
            const productId = item.id;
            if (productId == null) return null;

            const isOpen = expandedId === productId;
            const isSubmitting = submittingId === productId;

            return (
              <li key={productId} className="border-ash/20 rounded-2xl border">
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : productId)}
                    aria-expanded={isOpen}
                    className="text-ink flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <ChevronIcon isOpen={isOpen} />
                    <span className="min-w-0">
                      <span className="block truncate text-[16px] font-semibold">
                        {item.name ?? '(이름 없음)'}
                      </span>
                      <span className="text-ash mt-0.5 block text-[13px]">
                        #{productId} ·{' '}
                        {item.specType ? SPEC_TYPE_LABEL[item.specType] : '종류 미상'} ·{' '}
                        {item.source ? PRODUCT_SOURCE_LABEL[item.source] : '출처 미상'}
                        {item.brandName ? ` · ${item.brandName}` : ''}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setRejectTarget(item)}
                      className="border-danger-500/40 text-danger-700 rounded-[10px] border px-4 py-2 text-[14px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      반려
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        void submitReview(productId, 'APPROVED');
                      }}
                      className="bg-ink hover:bg-ink/85 rounded-[10px] px-4 py-2 text-[14px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting ? '처리 중...' : '승인'}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-ash/20 border-t px-5 py-5">
                    <ReviewProductDetail productId={productId} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rejectTargetId != null && (
        <RejectReasonDialog
          productName={rejectTarget?.name ?? `제품 #${rejectTargetId}`}
          isSubmitting={submittingId === rejectTargetId}
          onCancel={() => setRejectTarget(null)}
          onConfirm={(note) => {
            void submitReview(rejectTargetId, 'REJECTED', note);
          }}
        />
      )}

      {toastMessage !== null && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
    </div>
  );
};

export default ReviewPanel;
