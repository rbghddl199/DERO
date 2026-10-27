// 공지사항 목록 페이지 — 상단바 오른쪽 끝 확성기 아이콘으로 진입한다. 데이터는
// constants/notices.ts 하드코딩. 항목 클릭 시 /notice/[noticeId] 상세로 이동한다.
import type { Metadata } from 'next';
import Link from 'next/link';
import { NOTICES } from '@/constants/notices';

export const metadata: Metadata = {
  title: '공지사항 — 데스크테리어 시뮬레이터',
  description: 'DERO 서비스 공지사항을 확인하세요',
};

const NoticePage = () => {
  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-[760px] px-6 py-12 lg:px-0">
        <header className="border-ash/40 font-swiss mb-8 border-b pb-6 tracking-[-0.03em]">
          <h1 className="text-ink text-[26px] font-bold">공지사항</h1>
        </header>

        {NOTICES.length === 0 ? (
          <p className="text-ash text-[15px]">등록된 공지사항이 없습니다.</p>
        ) : (
          <ul className="divide-ash/20 divide-y">
            {NOTICES.map((notice) => (
              <li key={notice.id}>
                <Link
                  href={`/notice/${notice.id}`}
                  className="group flex items-baseline justify-between gap-4 py-4"
                >
                  <span className="text-ink group-hover:text-primary-700 text-[16px] font-semibold">
                    {notice.title}
                  </span>
                  <time dateTime={notice.date} className="text-ash shrink-0 text-[13px]">
                    {notice.date}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
};

export default NoticePage;
