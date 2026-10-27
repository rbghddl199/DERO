// 커뮤니티 게시물 상세 라우트 — **공개 상세는 서버가 받아 SSR한다**(D34·ADR-0037 결정 4).
// 데스크피드 상세와 같은 처방이다: 클라이언트가 useEffect로 받아 오면 첫 HTML에 본문이 없어
// 크롤러에게 이 글은 존재하지 않는 것이나 같다. 받아 온 상세는 generateMetadata·Article JSON-LD·
// 첫 렌더(initialDetail)에 함께 쓰고, 세션에 딸린 값(좋아요·본인 글)만 하이드레이션 뒤에 확정한다.
import type { Metadata } from 'next';
import { getPost } from '@/api/post';
import CommunityDetail from '@/components/community/CommunityDetail';
import { toPlainExcerpt } from '@/components/community/communityContent';
import { SITE_NAME, SITE_ORIGIN } from '@/constants/site';
import type { PostDetailResponse } from '@/types/post';
import { toJsonLdScript } from '@/utils/jsonLd';

/** 메타 설명 길이 — 검색 결과 스니펫이 잘리는 언저리. */
const DESCRIPTION_MAX_LENGTH = 120;

type Props = {
  params: Promise<{ postId: string }>;
};

async function loadDetail(postId: string): Promise<PostDetailResponse | null> {
  const id = Number(postId);
  if (!Number.isFinite(id)) return null;
  try {
    return await getPost(id);
  } catch (error: unknown) {
    console.error('[CommunityDetailPage] 상세 조회 실패', error);
    return null;
  }
}

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { postId } = await params;
  const detail = await loadDetail(postId);
  if (detail === null) {
    return { title: `커뮤니티 글 — ${SITE_NAME}` };
  }

  const description = toPlainExcerpt(detail.content, DESCRIPTION_MAX_LENGTH);
  return {
    title: `${detail.title} — ${SITE_NAME}`,
    description,
    alternates: { canonical: `${SITE_ORIGIN}/community/${detail.id}` },
    openGraph: {
      type: 'article',
      title: detail.title,
      description,
      url: `${SITE_ORIGIN}/community/${detail.id}`,
    },
  };
};

/** schema.org Article. 본문 이미지는 마크다운 안 key라 URL 해석이 필요해 싣지 않는다 —
 *  제목·본문·작성자만으로도 아티클 색인에는 충분하다. */
function articleJsonLd(detail: PostDetailResponse): string {
  return toJsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: detail.title,
    articleBody: detail.content,
    datePublished: detail.createdAt,
    ...(detail.updatedAt === null ? {} : { dateModified: detail.updatedAt }),
    author: { '@type': 'Person', name: detail.nickname },
    mainEntityOfPage: `${SITE_ORIGIN}/community/${detail.id}`,
  });
}

const CommunityDetailPage = async ({ params }: Props) => {
  const { postId } = await params;
  const detail = await loadDetail(postId);

  return (
    <>
      {detail !== null && (
        <script
          type="application/ld+json"
          // toJsonLdScript가 `<`를 이스케이프해 </script>가 만들어지지 않는다 — 그것이 이 자리에서
          // dangerouslySetInnerHTML을 쓰는 전제다(JSON.stringify만으로는 부족하다).
          dangerouslySetInnerHTML={{ __html: articleJsonLd(detail) }}
        />
      )}
      <CommunityDetail postId={Number(postId)} initialDetail={detail ?? undefined} />
    </>
  );
};

export default CommunityDetailPage;
