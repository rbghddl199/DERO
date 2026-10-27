// 커뮤니티 게시물 화면 모델 — 제목 + 마크다운 본문 + 좋아요.
// 팔로우·콘테스트·정렬·템플릿 선택·상품 임베딩 등 이전 버전의 나머지 부가 기능은 제거됐다
// (2026-07-30 재설계, 상품 임베딩은 2026-07-30 재제거).
// 게시글 북마크는 백엔드에 없지만(ADR-0013 결정 6) PostCard의 자체 북마크 토글(/community)이
// 이 필드들을 소비하므로 유지한다.
export type CommunityPost = {
  /** 서버 게시글 id의 문자열 표기 — 스토어 키·라우트 파라미터가 전부 문자열이라 여기서 맞춘다 */
  id: string;
  title: string;
  author: string;
  /** ISO 8601 문자열(백엔드 Date 직렬화 형태) — 표시할 땐 `formatRelativeTime`을 거친다 */
  createdAt: string;
  /** 마크다운 원문 — `[[placement:ID]]` 배치 임베드 토큰이 섞일 수 있다(ADR-0013 결정 1) */
  content: string;
  /** '#태그' 필터·카드 표기용 */
  tags: string[];
  bookmarkCount: number;
  likeCount: number;
  isBookmarked: boolean;
  isLiked: boolean;
  /** 서버 작성자 id — 본인 글일 때만 수정·삭제를 노출한다. 탈퇴 회원이면 null. 목업엔 없다 */
  authorId?: number | null;
  /** is_primary 이미지의 presigned GET URL — 목록 카드 표지. 이미지가 없으면 null. 목업엔 없다 */
  thumbnailUrl?: string | null;
  /** 서버 댓글 수 — 목업엔 없다 */
  commentCount?: number;
};

/** 게시물 댓글 — 본인이 쓴 것만 삭제 가능(author === '나') */
export type CommunityComment = {
  id: string;
  postId: string;
  author: string;
  content: string;
  /** ISO 8601 문자열(백엔드 Date 직렬화 형태) — 표시할 땐 `formatRelativeTime`을 거친다 */
  createdAt: string;
};
