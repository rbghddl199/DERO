'use client';
// 서버 상세가 준 글을 그대로 그린다 — 제목·설명의 정본은 `placement.title`·`description`이다
// (D33·ADR-0036). 종전 로컬 사이드카(`collectionMyPostsStore`)와 그 하이드레이션 가드는 폐기됐다:
// 배치에 컬렉션 전용 필드가 없다는 전제가 처음부터 틀렸다.
//
// **서버가 글을 안 주면 그냥 404다**(2026-08-02 수정) — 종전에는 로컬 스토어에서 한 번 더 찾아 폴백했고,
// 그래서 아직 PENDING인(상상도가 없는) 배치의 상세가 열렸다. 진행 상황은 상단 알림 벨이 알려주고,
// 완료 알림을 눌렀을 때 비로소 이 페이지가 열린다.

import { notFound } from 'next/navigation';
import CollectionDetail from './CollectionDetail';
import type { CollectionPost } from './types';

type Props = {
  initialPost: CollectionPost | null;
  returnHref?: string | null;
};

const CollectionDetailGate = ({ initialPost, returnHref = null }: Props) => {
  if (initialPost === null) notFound();

  return <CollectionDetail post={initialPost} returnHref={returnHref} />;
};

export default CollectionDetailGate;
