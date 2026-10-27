// /product/[productId] 서버 fetch(real 모드 단건 조회) 대기 중 스켈레톤 — /product/loading.tsx와 같은 이유.
const ProductDetailLoading = () => (
  <div className="bg-paper min-h-full">
    <div className="mx-auto max-w-[1200px] px-6 pt-8 pb-24 lg:px-[48px]">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="bg-fog aspect-square animate-pulse rounded-[10px]" />
        <div className="flex flex-col gap-3">
          <div className="bg-fog h-6 w-20 animate-pulse rounded-[10px]" />
          <div className="bg-fog h-9 w-3/4 animate-pulse rounded-[10px]" />
          <div className="bg-fog h-6 w-32 animate-pulse rounded-[10px]" />
        </div>
      </div>
    </div>
  </div>
);

export default ProductDetailLoading;
