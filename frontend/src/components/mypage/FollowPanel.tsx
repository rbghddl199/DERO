// 마이페이지 팔로우 관리 — 목업(followData.ts)을 걷어내고 실제 API로 바꿨다(DERO-344).
// 목록·커서·탭 로직은 남의 프로필 화면과 같은 것을 쓴다(components/user/FollowListPanel).

'use client';

import FollowListPanel from '@/components/user/FollowListPanel';

type Props = {
  /** 내 사용자 id. 세션의 userId는 문자열이라 호출부가 숫자로 바꿔 넘긴다. */
  userId: number;
};

const FollowPanel = ({ userId }: Props) => (
  <FollowListPanel key={userId} userId={userId} heading="팔로우 관리" />
);

export default FollowPanel;
