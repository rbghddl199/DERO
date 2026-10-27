// 데스크피드 상세의 좌측 플로팅 제품 레일 — "이 책상에 쓰인 제품"을 읽는 중에도 보여준다(DERO-615).
//
// **데스크톱 전용 중복 표시다**(`xl:` 이상) — 본문 아래 제품 그리드를 대체하지 않는다(모바일은
// 그 그리드로 충분하다). 서버 변화 0, `post.usedProducts`를 그대로 다시 그린다.
//
// `lg:`가 아니라 `xl:`인 것은 여백 폭 때문이다 — 레일은 본문(720px) 중앙 기준으로 붙어서
// 1024px 화면의 좌측 여백은 92px밖에 안 남는다(우측 액션 레일은 48px라 거기서도 들어간다).
//
// **자리는 보는 중인 사진에 매인다** — 사진 왼쪽 상단에 서고, 사진이 위로 빠져나가면 헤더 아래에
// 머물다가 사진이 완전히 지나가면 밀려 나간다. 그 움직임은 **`position: sticky`가 한다**
// (DERO-630): 상세가 프레임마다 좌표를 쓰던 판은 컴포지터 스크롤을 못 따라와 툭툭 끊겼다.
// 상세가 쓰는 것은 "어느 사진이냐"가 바뀔 때의 구간(top·height)뿐이다.

import Link from 'next/link';

import type { DeskFeedProductSummaryResponse } from '@/types/deskFeed';

type Props = {
  /** 서버가 소프트 삭제 제품을 뺀 목록. 최대 10개는 도메인 상한이라 여기서 다시 자르지 않는다(ADR-0034 결정 5). */
  products: DeskFeedProductSummaryResponse[];
  /** 레일 제목 — 보는 중인 사진의 태그를 그릴 때와 글 전체 목록을 그릴 때가 다르다(ADR-0040 결정 5 개정) */
  heading?: string;
  /** sticky가 머물 구간 박스 — 상세가 사진이 바뀔 때만 `top`·`height`를 쓴다(스크롤 중에는 쓰지 않는다). */
  ref?: React.Ref<HTMLDivElement>;
  /** 그 안에서 실제로 붙어 다니는 카드 블록 — 상세가 높이를 읽어 구간 길이에 더한다(아래 주석). */
  contentRef?: React.Ref<HTMLDivElement>;
};

const DeskFeedProductRail = ({
  products,
  heading = '이 책상에 쓰인 제품',
  ref,
  contentRef,
}: Props) => {
  // 제품이 없으면 레일째 없다 — 하단 그리드와 같은 조건이고, 판정을 여기 두어야 호출부마다 안 베낀다.
  if (products.length === 0) return null;

  // 보는 사진이 바뀌어 내용이 갈리면 key가 갈려 리마운트 — 150ms 페이드가 다시 돈다(ADR-0040 결정 5 개정).
  // key는 **바깥이 아니라 목록에** 있다: 바깥이 리마운트되면 상세가 써 둔 구간 값이 날아간다.
  const fadeKey = products.map((product) => product.id).join(',');

  return (
    // 본문(720px) 왼쪽 여백에 붙인다 — 우측 액션 레일과 같은 **본문 중앙 기준**이라
    // 두 레일이 대칭으로 선다(372 = 본문 절반 360 + 간격 12).
    <div className="absolute inset-y-0 right-[calc(50%+372px)] hidden w-[180px] xl:block">
      {/* sticky 구간 박스 — 첫 측정 전에는 `opacity-0`으로 숨어 있어 엉뚱한 자리에서 깜빡이지 않는다. */}
      <div ref={ref} className="absolute inset-x-0 top-0 opacity-0 transition-opacity duration-200">
        {/* 제품이 10개면 세로로 넘치므로 레일 안에서 스크롤한다(`top-28`과 짝인 8rem) —
            `sticky top-28`의 112px는 `utils/deskFeedRailAnchor.ts`의 `RAIL_CEILING_PX`와 같은 값이다. */}
        <div ref={contentRef} className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto">
          {/* 하단 그리드가 이미 같은 문구의 `h2`를 들고 있어 여기는 heading이 아니다 —
              문서 개요에 같은 제목이 두 번 들어가면 SEO·스크린리더 양쪽에서 손해다. */}
          <p className="text-ash mb-2 text-[12px] font-medium">{heading}</p>
          <ul key={fadeKey} className="desk-rail-fade flex flex-col gap-2">
            {products.map((product) => (
              <li key={product.id}>
                <Link
                  href={`/product/${product.id}`}
                  className="focus-visible:outline-primary-600 border-ash/30 hover:border-ink flex items-center gap-2 rounded-2xl border p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {product.imageUrl !== null ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 상세 하단 그리드와 같은 이미지를 같은 방식으로 쓴다(next/image 전환은 별건)
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="bg-fog size-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="bg-fog size-10 shrink-0 rounded-lg" />
                  )}
                  <div className="min-w-0">
                    <p className="text-ink truncate text-[13px] font-medium">{product.name}</p>
                    {/* 자작 제품에는 가격이 없다(D20) — 0원으로 꾸미지 않는다. */}
                    <p className="text-ash text-[12px] tabular-nums">
                      {product.priceKrw !== null
                        ? `${product.priceKrw.toLocaleString('ko-KR')}원`
                        : '가격 미정'}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DeskFeedProductRail;
