'use client';
// fixed 오버레이(모달·토스트)를 document.body 아래로 내보내는 포털.
// 원래는 옛 PageTransition 래퍼(2026-08-02 제거됨, "느리게 나타나는 연출" 삭제 요청)의
// `translate-y-*`(Tailwind v4는 `translate` CSS 속성을 낸다) 때문에 필요해졌다 — 그 안에서는
// position:fixed가 뷰포트가 아니라 래퍼를 기준으로 잡혀 `inset-0`가 문서 전체 높이로 늘어나고
// 스크롤 위치에 따라 창이 엉뚱한 곳에 떴다(2026-07-28 실측: top -1136px, height 3248px). 원인은
// 없어졌지만, transform/filter가 있는 조상이 새로 생기면 같은 문제가 재발하므로 트리 밖으로
// 빼는 이 패턴은 그대로 유지한다.
//
// 마운트 가드가 없는 이유: 이 포털에 담기는 것들은 전부 사용자 상호작용 뒤에만 렌더돼(모달 열기,
// 토스트 표시) SSR 출력에 포함되지 않는다 — 하이드레이션 불일치가 생길 수 없다.

import { createPortal } from 'react-dom';

type Props = {
  children: React.ReactNode;
};

const BodyPortal = ({ children }: Props) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

export default BodyPortal;
