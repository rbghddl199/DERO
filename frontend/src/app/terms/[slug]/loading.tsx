// /terms/[slug] 서버 fetch(약관 목록 + 스토리지 본문 2단) 대기 중 스켈레톤 — 동적 렌더 세그먼트라
// 이게 없으면 첫 방문에 빈 화면으로 멈춘다(product/loading.tsx와 같은 이유).
//
// 폭·여백은 page.tsx의 실제 값(max-w-[760px], px-6 py-12, 헤더 border-b pb-6 mb-8)과 맞춘다 —
// 어긋나면 스켈레톤이 오히려 레이아웃 점프를 만든다.
const TermsLoading = () => (
  <div className="bg-paper min-h-screen">
    <div className="mx-auto max-w-[760px] px-6 py-12 lg:px-0" aria-hidden="true">
      <div className="border-ash/40 mb-8 border-b pb-6">
        <div className="bg-fog h-8 w-56 animate-pulse rounded" />
        <div className="mt-3 flex gap-5">
          <div className="bg-fog h-4 w-32 animate-pulse rounded" />
          <div className="bg-fog h-4 w-16 animate-pulse rounded" />
        </div>
      </div>

      {Array.from({ length: 3 }).map((_, section) => (
        <div key={section} className="mb-8">
          <div className="bg-fog mb-3 h-5 w-40 animate-pulse rounded" />
          <div className="bg-fog mb-2 h-4 w-full animate-pulse rounded" />
          <div className="bg-fog mb-2 h-4 w-full animate-pulse rounded" />
          <div className="bg-fog h-4 w-2/3 animate-pulse rounded" />
        </div>
      ))}
    </div>
  </div>
);

export default TermsLoading;
