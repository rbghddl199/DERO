// /product 서버 fetch(real 모드 카탈로그 조회) 대기 중 스켈레톤 — collection가 겪은 "빈 화면 플래시" 갭을
// 여기선 처음부터 막는다(collection/CLAUDE.md 지속 이슈 참고).
//
// 실제 화면과 어긋나면 스켈레톤이 오히려 레이아웃 점프를 만든다 — 사이드바 폭, 광고 배너 자리,
// 카드 아래 텍스트 3줄, 제목 여백을 ProductGrid/ProductCard의 실제 값과 맞춰 둔다(2026-08-02).
const ProductLoading = () => (
  <div className="min-h-full bg-white">
    <div className="mx-auto max-w-[1200px] px-6 pt-12 pb-24 lg:px-[48px]">
      {/* 광고 배너 자리(ProductPromoBanner, aspect-[3/2] 3연) — 없으면 하이드레이션 시 아래
          콘텐츠가 배너 높이만큼 통째로 밀려 내려간다. sm 미만에서는 배너도 1장만 보인다. */}
      <div className="mb-12 flex gap-3 sm:mb-20" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-fog aspect-[3/2] flex-1 animate-pulse rounded-lg not-first:max-sm:hidden"
          />
        ))}
      </div>

      <div className="flex items-start gap-8">
        <div className="hidden w-[190px] shrink-0 md:block" aria-hidden="true">
          <div className="bg-fog h-64 animate-pulse rounded-lg" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="bg-fog mb-4 h-8 w-40 animate-pulse rounded-lg" />
          {/* 정렬 + 검색 행 */}
          <div className="mb-4 flex w-full items-center gap-2 sm:max-w-[420px]">
            <div className="bg-fog h-9 w-24 shrink-0 animate-pulse rounded-full" />
            <div className="bg-fog h-9 flex-1 animate-pulse rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div className="bg-fog aspect-square animate-pulse rounded-2xl" />
                {/* 카드 아래 브랜드·이름·가격 3줄 — 이미지만 그리면 텍스트가 붙는 순간 또 밀린다 */}
                <div className="bg-fog mt-2 h-4 w-16 animate-pulse rounded" />
                <div className="bg-fog mt-1 h-4 w-full animate-pulse rounded" />
                <div className="bg-fog mt-1.5 h-5 w-20 animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default ProductLoading;
