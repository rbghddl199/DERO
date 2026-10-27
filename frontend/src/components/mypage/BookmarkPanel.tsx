// 마이페이지 북마크 화면 — 실제 API를 쓰는 컬렉션 북마크(DeskBookmarkSection)를 표시한다.

'use client';

import DeskBookmarkSection from '@/components/mypage/DeskBookmarkSection';

const BookmarkPanel = () => (
  <section aria-labelledby="bookmark-panel-title">
    <div className="max-w-full min-w-0 border-b border-neutral-200 pb-5">
      <p className="text-primary-700 mb-2 max-w-full min-w-0 text-sm font-semibold tracking-[0.14em] break-all">
        BOOKMARK
      </p>
      <h1
        id="bookmark-panel-title"
        className="text-[34px] font-bold tracking-[-0.04em] text-neutral-900"
      >
        북마크
      </h1>
      <p className="mt-3 text-[15px] leading-6 text-neutral-600">
        북마크한 데스크를 한곳에서 확인해 보세요.
      </p>
    </div>

    <div className="pt-7">
      <DeskBookmarkSection />
    </div>
  </section>
);

export default BookmarkPanel;
