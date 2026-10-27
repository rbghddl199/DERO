'use client';
// 커뮤니티 목록 카드 — 그리드(정사각 그리드)·리스트(가로 카드) 두 레이아웃을 지원한다.
// 표지는 대표 이미지(is_primary, 서버 thumbnailUrl)를 쓴다. 없으면 본문 첫 사진으로 폴백하되
// **그 src가 http(s) URL일 때만** 쓴다 — 지금 본문에 저장되는 건 만료 없는 imageKey이고, 목록 응답에는
// key→URL 맵이 없어 그대로 <img src>에 넣으면 깨진 이미지가 뜬다(폴백은 URL로 저장된 옛 글용).
// 둘 다 없는 글은 표지 패널 자체를 생략한다(가짜 장식 그라디언트로 "사진이 있는 것처럼" 보이게 하지 않는다).
import Link from 'next/link';
import CountPillToggle from '@/components/common/CountPillToggle';
import RemoteImage from '@/components/common/RemoteImage';
import { HOT_POST_LIKE_THRESHOLD } from '@/constants/post';
import { EMPTY_COMMENTS, useCommunityCommentsStore } from '@/store/communityCommentsStore';
import { formatRelativeTime } from '@/utils/formatRelativeTime';
import AuthorAvatar from './AuthorAvatar';
import { extractFirstImageUrl, toPlainExcerpt } from './communityContent';
import type { CommunityPost } from './types';

const GRID_EXCERPT_MAX_LENGTH = 70;
const LIST_EXCERPT_MAX_LENGTH = 140;

const CommentIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 3.5h12v7H6.5L3.5 13v-2.5H2v-7Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

type Props = {
  post: CommunityPost;
  onToggleBookmark: (id: string) => void;
  onToggleLike: (id: string) => void;
  /** 'grid'(기본) — 정사각 그리드 카드. 'list' — 가로로 넓게 펼친 리딩 카드 */
  layout?: 'grid' | 'list';
};

const PostCard = ({ post, onToggleBookmark, onToggleLike, layout = 'grid' }: Props) => {
  // 대표 이미지가 있으면 그것, 없으면 본문 첫 사진(단 URL일 때만) — 둘 다 없으면 표지 패널을 생략한다.
  const bodyImageSrc = extractFirstImageUrl(post.content);
  const coverImageUrl =
    post.thumbnailUrl ?? (bodyImageSrc?.startsWith('http') ? bodyImageSrc : undefined);
  const userComments = useCommunityCommentsStore((s) => s.byPostId[post.id] ?? EMPTY_COMMENTS);
  // 게시글 댓글 API가 아직 없어 이 세션에서 단 댓글만 로컬에 있다 — 서버 수에 그만큼을 더해 보여준다.
  const commentCount = (post.commentCount ?? 0) + userComments.length;
  // 댓글이 있을 때만 첫 댓글 하나를 미리보기로 띄운다 — 없으면 생략(2026-07-30 사용자 확인)
  const previewComment = userComments[0];
  // 좋아요가 기준치 이상이면 제목 옆 HOT — post.likeCount는 CommunityGallery가 로컬 오버라이드까지
  // 반영해 내려준 값이라, 방금 누른 하트로 기준을 넘기면 그 자리에서 바로 뜬다.
  const hotBadge = post.likeCount >= HOT_POST_LIKE_THRESHOLD && (
    <span className="bg-danger-500 text-paper shrink-0 rounded-full px-1.5 py-0.5 text-[11px] leading-[1.4] font-semibold">
      HOT
    </span>
  );

  const interactionRow = (
    <div className="flex items-center gap-2">
      <CountPillToggle
        variant="like"
        isActive={post.isLiked}
        count={post.likeCount}
        onToggle={() => onToggleLike(post.id)}
        bare
      />
      <CountPillToggle
        variant="bookmark"
        isActive={post.isBookmarked}
        count={post.bookmarkCount}
        onToggle={() => onToggleBookmark(post.id)}
        bare
      />
      {/* 댓글은 토글이 아니라 개수 표시만 — 작성·삭제는 상세 페이지에서만 한다 */}
      <span className="text-ash ml-auto flex items-center gap-1 text-[13px] font-medium tabular-nums">
        <CommentIcon />
        {commentCount}
      </span>
    </div>
  );

  const previewCommentRow = previewComment && (
    <div className="bg-fog flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px]">
      <AuthorAvatar name={previewComment.author} size={18} />
      <span className="text-ink shrink-0 font-medium">{previewComment.author}</span>
      <span className="text-ash min-w-0 flex-1 truncate">{previewComment.content}</span>
    </div>
  );

  if (layout === 'list') {
    return (
      <article
        className={`border-ash/40 group flex rounded-2xl border p-6 transition-transform duration-300 ease-out hover:-translate-y-1 ${coverImageUrl ? 'gap-6' : ''}`}
      >
        {coverImageUrl && (
          <Link href={`/community/${post.id}`} className="block w-40 shrink-0 sm:w-56">
            <RemoteImage
              src={coverImageUrl}
              alt=""
              width={224}
              height={149}
              sizes="(min-width: 640px) 224px, 160px"
              className="aspect-[3/2] w-full rounded-[10px] object-cover"
            />
          </Link>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <AuthorAvatar name={post.author} size={24} />
            <span className="text-ink text-[14px] font-medium">{post.author}</span>
            <span className="text-ash text-[13px] tabular-nums">
              {formatRelativeTime(post.createdAt)}
            </span>
          </div>

          <Link href={`/community/${post.id}`} className="mt-3 block">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="text-ink min-w-0 text-[20px] font-medium">{post.title}</h3>
              {hotBadge}
            </div>
            <p className="text-ash mt-2 line-clamp-2 text-[14px] leading-[1.6]">
              {toPlainExcerpt(post.content, LIST_EXCERPT_MAX_LENGTH)}
            </p>
          </Link>

          {post.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  href={{ pathname: '/community', query: { tag } }}
                  className="bg-fog text-ink hover:bg-highlight cursor-pointer rounded-full px-2.5 py-1 text-[12px] transition-colors"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          {previewCommentRow && <div className="mt-4">{previewCommentRow}</div>}

          <div className="mt-4">{interactionRow}</div>
        </div>
      </article>
    );
  }

  return (
    // 2026-07-31에 CSS columns(매스너리)로 바꿨다가 2026-08-03에 되돌렸다 — columns는 칼럼 단위로
    // 위→아래로 채워서 최신 글이 좌→우 순서로 읽히지 않았다(읽기 순서 > 높이 엇갈림). 부모가 다시
    // CSS grid이므로 매스너리용 mb-4/break-inside-avoid는 뺀다(간격은 부모 gap이 준다).
    <article className="border-ash/40 group flex flex-col rounded-2xl border p-4 transition-transform duration-300 ease-out hover:-translate-y-1">
      <Link href={`/community/${post.id}`} className="block">
        {/* aspect-video(16:9, Tailwind 내장 유틸)를 고정으로 쓴다 — 배열+해시로 매 카드 비율을
            바꾸는 이전 방식은 세로형이 섞여 나온 적이 있어(2026-07-30 실측 제보), 내장 유틸 하나로
            고정해 재발 여지를 없앤다. 사진이 없는 글은 이 블록 자체를 렌더하지 않는다. */}
        {coverImageUrl && (
          <RemoteImage
            src={coverImageUrl}
            alt=""
            width={640}
            height={360}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="aspect-video w-full rounded-[10px] object-cover"
          />
        )}

        {/* 제목이 길면 truncate가 뱃지까지 잘라먹으므로 flex로 분리하고 h3에만 min-w-0을 준다 */}
        <div className={`flex min-w-0 items-center gap-1.5 ${coverImageUrl ? 'mt-3' : ''}`}>
          <h3 className="text-ink min-w-0 truncate text-[17px] font-medium">{post.title}</h3>
          {hotBadge}
        </div>
        <p className="text-ash mt-1 line-clamp-2 text-[14px] leading-[1.6]">
          {toPlainExcerpt(post.content, GRID_EXCERPT_MAX_LENGTH)}
        </p>
      </Link>

      {post.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <Link
              key={tag}
              href={{ pathname: '/community', query: { tag } }}
              className="bg-fog text-ink hover:bg-highlight cursor-pointer rounded-full px-2.5 py-1 text-[12px] transition-colors"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {previewCommentRow && <div className="mt-3">{previewCommentRow}</div>}

      <div className="mt-3 flex items-center gap-2">
        <AuthorAvatar name={post.author} size={24} />
        <span className="text-ink truncate text-[14px]">{post.author}</span>
        <span className="text-ash ml-auto shrink-0 text-[13px] tabular-nums">
          {formatRelativeTime(post.createdAt)}
        </span>
      </div>

      <div className="mt-2">{interactionRow}</div>
    </article>
  );
};

export default PostCard;
