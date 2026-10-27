// /craft 빈 상태 — 데스크테리어가 하나도 없을 때 목록 자리에 표시
import Link from 'next/link';

const CraftEmptyState = () => {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <svg
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-ash"
        aria-hidden="true"
      >
        <rect x="3" y="8" width="18" height="12" rx="1.5" />
        <path d="M3 8l2-4h14l2 4" />
        <path d="M9 12h6" />
      </svg>
      <p className="text-ash text-[15px]">아직 만든 데스크테리어가 없어요</p>
      <Link
        href="/craft/new"
        className="bg-primary-200 hover:bg-primary-400 active:bg-primary-500 rounded-xl px-5 py-3 text-[15px] font-medium whitespace-nowrap text-gray-600 transition-colors hover:text-neutral-900"
      >
        새 데스크테리어 만들러 가기
      </Link>
    </div>
  );
};

export default CraftEmptyState;
