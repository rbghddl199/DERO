'use client';
// /collection 목록 조회 실패 표시 — craft/CraftLoadErrorState.tsx와 같은 패턴.
// 재시도는 호출부(CollectionGalleryLoader)가 넘긴다: 목록을 브라우저에서 받게 되면서
// router.refresh()로 서버 컴포넌트를 다시 태우던 옛 방식은 아무것도 다시 부르지 않는다
// (2026-08-01, DERO-339).

import ErrorState from '@/components/common/ErrorState';

type Props = {
  onRetry: () => void;
};

const CollectionLoadErrorState = ({ onRetry }: Props) => (
  <ErrorState
    title="컬렉션를 불러오지 못했습니다"
    description="백엔드 서버가 실행 중인지 확인한 뒤 다시 시도해주세요."
    retryLabel="다시 시도"
    onRetry={onRetry}
  />
);

export default CollectionLoadErrorState;
