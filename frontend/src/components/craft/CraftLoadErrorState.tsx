// /craft 목록 조회 실패 표시 — 목록 자리에 대신 놓는다. 재시도는 호출부
// (CraftDeskCollectionLoader)가 클라이언트에서 다시 fetch하고, 그동안 이 컴포넌트는 통째로
// 로딩 상태로 교체된다(그래서 pending 표시를 여기서 들고 있지 않는다).
// 예전엔 서버 컴포넌트가 목록을 받아 왔기 때문에 여기서 router.refresh()로 서버 왕복을 다시
// 시켰지만, 조회가 클라이언트로 내려온 뒤로는 refresh가 목록을 다시 받아오지 못한다.

import ErrorState from '@/components/common/ErrorState';

type Props = {
  onRetry: () => void;
};

const CraftLoadErrorState = ({ onRetry }: Props) => (
  <ErrorState
    title="데스크테리어를 불러오지 못했습니다"
    description="백엔드 서버가 실행 중인지 확인한 뒤 다시 시도해주세요."
    onRetry={onRetry}
  />
);

export default CraftLoadErrorState;
