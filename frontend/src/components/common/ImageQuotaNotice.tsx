// 오늘 쓴 이미지 장수·상한·리셋 시각 표시 — 남은 장수를 모르면 아껴 쓸 수가 없다(REQ-IMG-03).
// 조회는 useImageQuota가 하고 이 컴포넌트는 그리기만 한다.

import type { ImageQuotaResponse } from '@/types/user';
import { formatQuotaResetAt, remainingImageQuota } from '@/utils/imageQuota';

type Props = {
  quota: ImageQuotaResponse | null;
  /** 조회 중 자리를 잡아둘지 — 업로드 화면처럼 레이아웃이 흔들리면 안 되는 곳에서 true. */
  isLoading?: boolean;
};

const ImageQuotaNotice = ({ quota, isLoading = false }: Props) => {
  if (quota === null) {
    return isLoading ? (
      <p className="text-ash text-[13px] leading-5">이미지 사용량 확인 중…</p>
    ) : null;
  }

  const remaining = remainingImageQuota(quota);
  const isExhausted = remaining === 0;

  return (
    <p
      role="status"
      data-testid="image-quota-notice"
      className={`text-[13px] leading-5 ${isExhausted ? 'text-danger-700' : 'text-ash'}`}
    >
      오늘 이미지 {quota.usedToday}/{quota.dailyLimit}장 사용 ·{' '}
      {isExhausted ? '남은 횟수 없음' : `${remaining}장 남음`} · {formatQuotaResetAt(quota.resetAt)}{' '}
      리셋
    </p>
  );
};

export default ImageQuotaNotice;
