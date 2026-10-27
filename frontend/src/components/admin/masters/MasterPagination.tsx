// 마스터 목록의 offset 페이지 이동 — 이전·다음 버튼과 현재 위치 표시.
// 백엔드 page 번호는 0부터라 화면에는 +1 해서 보여준다.

'use client';

import type { PageInfo } from '@/api/admin/masters';
import { MASTER_GHOST_BUTTON_CLASS } from '@/constants/admin/masters';

type Props = {
  page: number;
  pageInfo: PageInfo | null;
  isLoading: boolean;
  onChangePage: (nextPage: number) => void;
};

const MasterPagination = ({ page, pageInfo, isLoading, onChangePage }: Props) => {
  const totalPages = pageInfo?.totalPages ?? 0;
  const totalElements = pageInfo?.totalElements ?? 0;
  const hasPrevious = page > 0;
  const hasNext = page + 1 < totalPages;

  return (
    <div className="mt-4 flex items-center justify-between">
      <p className="text-ash text-[13px] tabular-nums">
        총 {totalElements.toLocaleString('ko-KR')}건 · {totalPages === 0 ? 0 : page + 1} /{' '}
        {totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!hasPrevious || isLoading}
          onClick={() => onChangePage(page - 1)}
          className={MASTER_GHOST_BUTTON_CLASS}
        >
          이전
        </button>
        <button
          type="button"
          disabled={!hasNext || isLoading}
          onClick={() => onChangePage(page + 1)}
          className={MASTER_GHOST_BUTTON_CLASS}
        >
          다음
        </button>
      </div>
    </div>
  );
};

export default MasterPagination;
