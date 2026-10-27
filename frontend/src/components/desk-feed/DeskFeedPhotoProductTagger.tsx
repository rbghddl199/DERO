'use client';
// 본문에서 고른 사진에 제품을 붙이는 패널(ADR-0040 결정 5) — 작성·수정 폼이 같이 쓴다.
//
// 사진을 고르지 않았으면 아무것도 그리지 않는다. 제품 검색은 글 단위 피커(`DeskFeedProductPicker`)를
// 그대로 재사용한다 — 같은 서버 검색을 두 벌 만들 이유가 없다.
//
// **사진에 붙인 제품은 글 단위 목록에 자동 합류한다**(ADR-0040 결정 2) — 사용자가 같은 제품을 두 번
// 고르지 않기 위해서고, 서버도 글 목록 밖 제품은 422로 막는다. 상한은 글 단위 ≤10 그대로라, 목록이
// 꽉 차서 못 들어간 제품은 **태그에도 넣지 않는다**: 그대로 보내면 422가 된다.
//
// **저장은 이 패널이 하지 않는다** — 호출부가 태그를 들고 있다가 글 저장 뒤에
// `PUT .../images/{imageId}/products`로 내보낸다(글 단위 목록이 먼저 저장돼야 422가 안 난다).

import { DESK_FEED_MAX_PRODUCTS } from '@/constants/deskFeed';
import type { DeskFeedProductSummaryResponse } from '@/types/deskFeed';
import DeskFeedProductPicker from './DeskFeedProductPicker';

type Props = {
  /** 본문에서 고른 사진이 있는지 — 없으면(false) 패널을 그리지 않는다 */
  isImageSelected: boolean;
  /** 고른 사진에 붙어 있는 제품 id */
  productIds: readonly number[];
  /** 글 단위 제품 목록(정본) */
  products: DeskFeedProductSummaryResponse[];
  /** 글 목록과 이 사진의 태그를 함께 넘긴다 — 호출부가 폼 상태 두 곳에 각각 반영한다 */
  onChange: (next: { products: DeskFeedProductSummaryResponse[]; productIds: number[] }) => void;
};

const DeskFeedPhotoProductTagger = ({ isImageSelected, productIds, products, onChange }: Props) => {
  if (!isImageSelected) return null;

  // 태그는 id만 들고 있다 — 이름·가격은 글 목록이 답한다(ADR-0040 결정 2와 같은 규칙).
  const tagged = productIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product) => product !== undefined);

  const handleChange = (next: DeskFeedProductSummaryResponse[]): void => {
    const merged = [...products];
    for (const product of next) {
      if (merged.some((it) => it.id === product.id)) continue;
      if (merged.length >= DESK_FEED_MAX_PRODUCTS) continue;
      merged.push(product);
    }
    onChange({
      products: merged,
      productIds: next.filter((it) => merged.some((m) => m.id === it.id)).map((it) => it.id),
    });
  };

  return (
    <div className="border-ash/40 rounded-[10px] border p-3">
      <DeskFeedProductPicker
        selected={tagged}
        onChange={handleChange}
        heading="이 사진에 찍힌 제품"
        // 글 목록에 자리가 없으면 새 제품은 못 담는다 — 조용히 떨어뜨리지 않고 그 사실을 말한다.
        remainingSlots={DESK_FEED_MAX_PRODUCTS - products.length}
        description="고른 사진 옆에 걸립니다. 여기서 붙인 제품은 아래 “사용된 제품”에도 함께 담깁니다."
      />
    </div>
  );
};

export default DeskFeedPhotoProductTagger;
