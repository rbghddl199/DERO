// 약관 본문 공개 페이지 — 주소는 항목 기준(/terms/terms-of-service)이라 항상 현행 회차를 보여준다.
// 회차 기준 주소(/terms/152)는 만들지 않는다.
//
// 2단 서버 fetch다: ① GET /terms로 항목별 현행 회차를 받고 ② 해당 항목의 contentUrl(presigned GET,
// TTL 15분)을 서버에서 읽어 마크다운 텍스트만 렌더한다. presigned URL이 브라우저에 안 나가는 게
// 이 구조의 목적이다 — 클라이언트에서 부르면 S3 CORS에도 걸린다.
//
// generateStaticParams를 두지 않는다: 정적 생성하면 약관 개정에 재배포가 필요해진다. 목록·본문 모두
// revalidate 60이라 동적 렌더 + 60초 데이터 캐시로 돈다.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchCurrentTerms, fetchTermsMarkdown } from '@/api/terms.server';
import TermsDocument from '@/components/terms/TermsDocument';
import { findTermsBySlug, formatTermsEffectiveDate, hasTermsContent } from '@/utils/terms';

type Props = {
  params: Promise<{ slug: string }>;
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { slug } = await params;
  const terms = findTermsBySlug(await fetchCurrentTerms(), slug);

  if (terms === null || !hasTermsContent(terms)) {
    return { title: '약관을 찾을 수 없습니다 — DERO' };
  }

  return {
    title: `${terms.title} — DERO`,
    description: `DERO ${terms.title} 전문입니다.`,
  };
};

const TermsPage = async ({ params }: Props) => {
  const { slug } = await params;
  const terms = findTermsBySlug(await fetchCurrentTerms(), slug);

  // 목록에 없는 슬러그이거나, 본문(content_key)이 등록되지 않은 항목(AGE_OVER_14)은 보여줄 게 없다.
  if (terms === null || !hasTermsContent(terms)) {
    notFound();
  }

  const content = await fetchTermsMarkdown(terms.contentUrl);

  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-[760px] px-6 py-12 lg:px-0">
        <header className="border-ash/40 font-swiss mb-8 border-b pb-6 tracking-[-0.03em]">
          <h1 className="text-ink text-[26px] font-bold">{terms.title}</h1>
          <dl className="text-ash mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
            {terms.effectiveAt !== undefined ? (
              <div className="flex gap-1.5">
                <dt>시행일</dt>
                <dd className="text-ink">{formatTermsEffectiveDate(terms.effectiveAt)}</dd>
              </div>
            ) : null}
            {terms.revision !== undefined ? (
              <div className="flex gap-1.5">
                <dt>회차</dt>
                <dd className="text-ink">{terms.revision}차</dd>
              </div>
            ) : null}
          </dl>
        </header>

        <TermsDocument content={content} />
      </div>
    </main>
  );
};

export default TermsPage;
