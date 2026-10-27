// 커뮤니티 게시글 seam — 화면이 쓰는 CommunityPost 뷰 모델과 실제 /posts API(api/post.ts) 사이의
// 변환만 한다. 2026-08-03에 목업 재노출에서 실제 호출로 바뀌었다(백엔드 PostController 신설,
// DERO-345) — 이 파일이 있는 이유가 바로 그 교체 지점을 한 곳으로 모으는 것이었다.
//
// 댓글은 아직 게시글용 엔드포인트가 없어 클라이언트 세션 스토어(communityCommentsStore)에만 있다 —
// 목업 시드 댓글(communityComments.ts)은 id가 'placeholder-N'이라 실제 숫자 id와 절대 안 맞아서 지웠다.

import { createPost, deletePost, getPost, listPosts, updatePost } from './post';
import type { CommunityPost } from '@/components/community/types';
import type {
  ListPostsParams,
  PostDetailResponse,
  PostSaveRequest,
  PostSummaryResponse,
} from '@/types/post';

export type CommunityPostPage = {
  posts: CommunityPost[];
  nextCursor: string | null;
  hasNext: boolean;
};

// 게시글 북마크는 만들지 않는다(ADR-0013 결정 6) — 그런데 PostCard가 isBookmarked/bookmarkCount를
// 계속 소비하므로 서버 값이 없는 이 둘만 기본값으로 채운다.
// isLiked도 목록 응답엔 없다(전체의 좋아요 여부를 한 번에 주는 엔드포인트가 없다) — 목록 화면의
// 하트는 communityLikesStore 오버라이드가 덮고, 상세는 GET /posts/{id}/like로 서버 값을 쓴다.
export function toCommunityPost(summary: PostSummaryResponse): CommunityPost {
  return {
    id: String(summary.id),
    title: summary.title,
    author: summary.nickname,
    createdAt: summary.createdAt,
    content: summary.content,
    tags: summary.hashtags,
    bookmarkCount: 0,
    likeCount: summary.likeCount,
    isBookmarked: false,
    isLiked: false,
    authorId: summary.authorId,
    thumbnailUrl: summary.thumbnailUrl,
    commentCount: summary.commentCount,
  };
}

export function detailToCommunityPost(detail: PostDetailResponse): CommunityPost {
  return {
    id: String(detail.id),
    title: detail.title,
    author: detail.nickname,
    createdAt: detail.createdAt,
    content: detail.content,
    tags: detail.hashtags,
    bookmarkCount: 0,
    likeCount: detail.likeCount,
    isBookmarked: false,
    isLiked: false,
    authorId: detail.authorId,
    thumbnailUrl: detail.images.find((image) => image.isPrimary)?.imageUrl ?? null,
    commentCount: detail.commentCount,
  };
}

export async function getCommunityPostPage(
  params: ListPostsParams = {},
): Promise<CommunityPostPage> {
  const page = await listPosts(params);
  return {
    // 데스크피드 글을 빼는 클라이언트 필터는 2026-08-10에 사라졌다 — 전용 desk_feed 테이블로
    // 갈라져(ADR-0033 결정 1) post 목록에 애초에 섞이지 않는다.
    posts: page.content.map(toCommunityPost),
    nextCursor: page.nextCursor,
    hasNext: page.hasNext,
  };
}

export async function getCommunityPost(id: number): Promise<CommunityPost> {
  return detailToCommunityPost(await getPost(id));
}

export async function createCommunityPost(request: PostSaveRequest): Promise<PostDetailResponse> {
  return createPost(request);
}

export async function updateCommunityPost(
  id: number,
  request: PostSaveRequest,
): Promise<PostDetailResponse> {
  return updatePost(id, request);
}

export function removeCommunityPost(id: number): Promise<void> {
  return deletePost(id);
}
