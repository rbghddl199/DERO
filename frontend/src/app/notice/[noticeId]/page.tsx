// 공지사항 상세 페이지 — 데이터가 constants/notices.ts 하드코딩이라 서버 컴포넌트에서 바로 찾는다.
// 없는 id는 notFound()로 404 처리.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NOTICES } from '@/constants/notices';

type Props = {
  params: Promise<{ noticeId: string }>;
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { noticeId } = await params;
  const notice = NOTICES.find((n) => n.id === Number(noticeId));

  return {
    title: `${notice?.title ?? '공지사항'} — 데스크테리어 시뮬레이터`,
    description: 'DERO 서비스 공지사항을 확인하세요',
  };
};

const NoticeDetailPage = async ({ params }: Props) => {
  const { noticeId } = await params;
  const notice = NOTICES.find((n) => n.id === Number(noticeId));

  if (!notice) notFound();

  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-[760px] px-6 py-12 lg:px-0">
        <header className="border-ash/40 font-swiss mb-8 border-b pb-6 tracking-[-0.03em]">
          <h1 className="text-ink text-[26px] font-bold">{notice.title}</h1>
          <time dateTime={notice.date} className="text-ash mt-2 block text-[13px]">
            {notice.date}
          </time>
        </header>

        <p className="text-ink text-[15px] leading-relaxed whitespace-pre-line">{notice.body}</p>

        <Link
          href="/notice"
          className="text-ash hover:text-ink mt-10 inline-block text-[14px] underline underline-offset-4"
        >
          목록으로
        </Link>
      </div>
    </main>
  );
};

export default NoticeDetailPage;
