// 데스크피드 상세 라우트 — **공개 상세는 서버가 받아 SSR한다**(D34·ADR-0037 결정 4).
// 이 프로젝트의 사활은 SEO고, 검색 유입은 크롤러가 읽을 텍스트 총량에 비례한다. 종전처럼 클라이언트가
// useEffect로 받아 오면 첫 HTML에 본문이 아예 없어 색인될 것이 제목 한 줄도 남지 않는다.
//
// 받아 온 상세는 ①`generateMetadata`(제목·본문 발췌) ②schema.org Article JSON-LD ③화면 첫 렌더
// (`initialDetail`)에 함께 쓴다. 세션에 딸린 값(좋아요 여부·본인 글 판정)만 하이드레이션 뒤에
// 클라이언트가 확정한다 — 그 둘은 응답에 없다(비로그인 공개 응답이다).
import type { Metadata } from 'next';
import { getDeskFeed } from '@/api/deskFeed';
import { resolveMentions, toPlainExcerpt } from '@/components/community/communityContent';
import DeskFeedDetail from '@/components/desk-feed/DeskFeedDetail';
import { SITE_NAME, SITE_ORIGIN } from '@/constants/site';
import type { DeskFeedDetailResponse } from '@/types/deskFeed';
import { orderImageUrlsByContent } from '@/utils/deskFeedContent';
import { toJsonLdScript } from '@/utils/jsonLd';

/** 메타 설명 길이 — 검색 결과 스니펫이 잘리는 언저리. */
const DESCRIPTION_MAX_LENGTH = 120;

type Props = {
  params: Promise<{ postId: string }>;
};

/** 서버 조회 — 실패(404·사진 0장 글 포함)는 null로 접는다. 화면은 클라이언트 조회로 이어 간다. */
async function loadDetail(postId: string): Promise<DeskFeedDetailResponse | null> {
  const id = Number(postId);
  if (!Number.isFinite(id)) return null;
  try {
    return await getDeskFeed(id);
  } catch (error: unknown) {
    console.error('[DeskFeedDetailPage] 상세 조회 실패', error);
    return null;
  }
}

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { postId } = await params;
  const detail = await loadDetail(postId);
  if (detail === null) {
    return { title: `데스크피드 사진 — ${SITE_NAME}` };
  }

  // 멘션을 먼저 푼다 — 안 풀면 검색 결과 설명에 `[[user:12]]`가 그대로 노출된다(D35·ADR-0038).
  const description = toPlainExcerpt(
    resolveMentions(detail.content, detail.mentions),
    DESCRIPTION_MAX_LENGTH,
  );
  return {
    title: `${detail.title} — ${SITE_NAME}`,
    description,
    alternates: { canonical: `${SITE_ORIGIN}/desk-feed/${detail.id}` },
    openGraph: {
      type: 'article',
      title: detail.title,
      description,
      url: `${SITE_ORIGIN}/desk-feed/${detail.id}`,
      // 대표는 **본문 첫 이미지**다 — `images` 배열은 등록 순서라 그대로 쓰면 표지와 어긋난다.
      // URL은 만료 없는 공개 주소다(ADR-0035 — presigned GET은 GLB·약관에만 남았다).
      ...(coverUrlOf(detail) === null ? {} : { images: [coverUrlOf(detail) as string] }),
    },
  };
};

/** 목록 카드와 같은 규칙의 표지 — 본문 첫 이미지. 등록 전이면 null. */
function coverUrlOf(detail: DeskFeedDetailResponse): string | null {
  return orderImageUrlsByContent(detail.content, detail.images)[0] ?? null;
}

/** schema.org Article — 크롤러가 제목·본문·작성자·시각을 구조로 읽는다. */
function articleJsonLd(detail: DeskFeedDetailResponse): string {
  const cover = coverUrlOf(detail);
  return toJsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: detail.title,
    articleBody: resolveMentions(detail.content, detail.mentions),
    datePublished: detail.createdAt,
    ...(detail.updatedAt === null ? {} : { dateModified: detail.updatedAt }),
    author: { '@type': 'Person', name: detail.nickname },
    mainEntityOfPage: `${SITE_ORIGIN}/desk-feed/${detail.id}`,
    ...(cover === null ? {} : { image: [cover] }),
  });
}

const DeskFeedDetailPage = async ({ params }: Props) => {
  const { postId } = await params;
  const detail = await loadDetail(postId);

  return (
    <div className="bg-paper min-h-full">
      {detail !== null && (
        <script
          type="application/ld+json"
          // toJsonLdScript가 `<`를 이스케이프해 </script>가 만들어지지 않는다 — 그것이 이 자리에서
          // dangerouslySetInnerHTML을 쓰는 전제다(JSON.stringify만으로는 부족하다).
          dangerouslySetInnerHTML={{ __html: articleJsonLd(detail) }}
        />
      )}
      {/* key: 이전/다음 글 이동은 같은 라우트 안의 param 변경이라 remount로 상태(좋아요·댓글 초안)를 초기화한다 */}
      <DeskFeedDetail
        key={postId}
        deskFeedId={Number(postId)}
        initialDetail={detail ?? undefined}
      />
    </div>
  );
};

export default DeskFeedDetailPage;
