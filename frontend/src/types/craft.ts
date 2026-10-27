// 크래프트(내 데스크테리어) 도메인 타입 — 목록/카드에서 공유
import type { PublishStatus } from '@/types/placement';

export type DeskProject = {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  updatedAt: string;
  /** 만들 때 정한 **예산**이지 데스크 가격이 아니다(`placement.budgetKrw`). 실제 합계는
   *  `GET /placements/{id}/estimate`의 `totalPriceKrw`뿐이다 — 목록 응답엔 합계가 없다.
   *  `price`라는 이름으로 두었더니 옛 게시 폼이 "가격"으로 그렸다(2026-08-10). */
  budgetKrw: number;
  /** 컬렉션 공개 상태(ADR-0015 결정 1) — 카드의 상태 배지·업로드/공개취소 버튼이 이 값으로 갈린다.
   *  PUBLIC·FAILED는 서버만 정하므로 프론트는 읽기만 한다. 아직 서버에 저장된 적 없는 낙관적
   *  로컬 항목(craftProjectsStore)은 항상 'PRIVATE'이다 — 업로드는 저장과 별개 요청이다. */
  publishStatus: PublishStatus;
  /** 이 데스크테리어에 배치된 제품 id 목록(three/scene/product.ts ProductSpec id) — 있으면 커뮤니티
   *  상세의 '예상 견적'·'사용 제품 수'가 이 목록에서 자동 계산된다.
   *  현재는 대개 undefined다: 목록 API(`PlacementSummaryResponse`)에 제품 정보가 아예 없고, 상세
   *  API(`ItemDetailResponse.productId`)는 백엔드 숫자 id라 프론트 문자열 카탈로그 id로 바로 쓸 수
   *  없다(`components/craft/CLAUDE.md`의 id 불일치 항목). 그 매핑이 생기면 채우고 required로 바꾼다. */
  usedProductIds?: string[];
};
