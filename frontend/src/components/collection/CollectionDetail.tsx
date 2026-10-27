'use client';
// 컬렉션 상세 — 미리보기 이미지 + 제목·설명·작성자·태그·북마크·"가져오기"를
// 한 화면에 담고, 아래에 "사용된 아이템" 그리드를 둔다. placementId로 실제 배치를 getPlacement로
// 불러온다. 금액은 합계만 보여준다 — 남의 예산·초과는 안 그린다(2026-08-02 요청,
// PlacementEstimateSummary showBudget={false}).
//
// "가져오기"는 서버가 복제한다(DERO-343, `POST /placements/{id}/remixes`) — 클라이언트 재조립은
// 출처를 남기지 못한다: 서버 복제본만 sourcePlacement를 갖고, 그 값으로 이 화면이 원본 링크를 그린다.
// 성공하면 사본의 편집 화면(/simulator?deskProjectId=)으로 바로 보낸다. 사본은 아직 썸네일이
// 없지만 여기서 따로 챙길 것은 없다 — loadPlacement가 상세 응답의 thumbnailUrl === null을 보고
// 스스로 찍어 올린다(2026-08-06, simulatorStore). 단 **내 데스크에서는 버튼이 disabled다**
// (2026-08-02 요청) — 서버가 사본을 만들어 주므로 같은 배치가 작업실에 두 장 생긴다
// (DERO-366).
// 미리보기 사진은 실제 배치 썸네일(presigned GET URL)이고 아직 안 찍었으면 샘플로 폴백한다
// (CollectionCoverImage). 작성자 아바타는 커뮤니티 전용 컴포넌트 대신 공용 PersonAvatar를 쓴다
// (collection는 커뮤니티와 별개 컴포넌트로 만든다는 요청).
// 북마크·댓글은 실제 API를 쓴다. 상세 사이드바의 좋아요 버튼은 2026-08-06 요청으로 제거했고,
// 북마크만 남겼다. 조회 키는 post.id가 아니라 post.placementId(실제 배치 id)다.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import BackButton from '@/components/common/BackButton';
import PersonAvatar from '@/components/common/PersonAvatar';
import PlacementEstimateSummary from '@/components/common/PlacementEstimateSummary';
import SimulatorEntryWarningDialog from '@/components/common/SimulatorEntryWarningDialog';
import Toast from '@/components/common/Toast';
import { ApiError } from '@/api/client';
import {
  deletePlacementBookmark,
  getPlacementBookmark,
  putPlacementBookmark,
} from '@/api/interaction';
import { createPlacementRemix, deletePlacement, getPlacement } from '@/api/placement';
import { getProductById } from '@/api/product';
import { COLLECTION_MAX_TAGS } from '@/constants/collectionPosts';
import { INTERACTION_ERROR_CODES } from '@/constants/interaction';
import { useIsAuthenticated } from '@/hooks/useIsAuthenticated';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useSimulatorEntryGuard } from '@/hooks/useSimulatorEntryGuard';
import { useAuthStore } from '@/store/authStore';
import type { PlacementBookmarkStatusResponse } from '@/types/interaction';
import type { PlacementDetailResponse } from '@/types/placement';
import { formatRelativeTime } from '@/utils/formatRelativeTime';
import BookmarkGroupPicker from './BookmarkGroupPicker';
import CollectionComments from './CollectionComments';
import CollectionRealPhotos from './CollectionRealPhotos';
import CollectionCoverImage from './CollectionCoverImage';
import CollectionGeneratedImages from './CollectionGeneratedImages';
import CollectionUsedItems from './CollectionUsedItems';
import type { CollectionPost } from './types';
import { groupItemsByProductId, type UsedItem } from './usedItems';

const FRAME_TYPE_LABEL: Record<string, string> = {
  FOUR_LEG: '네다리형',
  T_FRAME: 'T자형',
  TOP_ONLY: '상판만',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; detail: PlacementDetailResponse };

const PLACEMENT_NOT_FOUND_MESSAGE = '비공개거나 삭제된 배치예요.';
const PLACEMENT_LOAD_ERROR_MESSAGE = '배치 정보를 불러올 수 없어요.';

const BOOKMARK_TOAST_MESSAGE = {
  added: '북마크에 저장되었습니다.',
  moved: '북마크 그룹을 옮겼습니다.',
  removed: '북마크가 취소되었습니다.',
} as const;

type Props = {
  post: CollectionPost;
  returnHref?: string | null;
};

const CollectionDetail = ({ post, returnHref = null }: Props) => {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const {
    pending: hwaccelPending,
    guardEntry: guardSimulatorEntry,
    cancel: cancelSimulatorEntry,
    proceedAnyway: proceedSimulatorEntryAnyway,
  } = useSimulatorEntryGuard();
  const isAuthenticated = useIsAuthenticated();
  // 세션의 userId는 문자열, 글의 authorId는 숫자다 — 비교는 문자열로 맞춘다.
  const myUserId = useAuthStore((s) =>
    s.auth.status === 'authenticated' ? s.auth.session.userId : null,
  );
  const isMyPost = myUserId !== null && post.authorId != null && String(post.authorId) === myUserId;

  // 비로그인이면 북마크 조회가 401이라 아예 부르지 않는다. 로그아웃 시 값을 이펙트에서 지우지
  // 않고 렌더에서 걸러낸다(파생 상태를 setState로 만들지 않는다).
  const [loadedBookmarkStatus, setLoadedBookmarkStatus] =
    useState<PlacementBookmarkStatusResponse | null>(null);
  const bookmarkStatus = isAuthenticated ? loadedBookmarkStatus : null;
  const [isGroupPickerOpen, setIsGroupPickerOpen] = useState(false);
  const [isBookmarkSubmitting, setIsBookmarkSubmitting] = useState(false);

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  /** 배치에 놓인 제품들(수량 묶음) — 배치 상세가 온 뒤 GET /products/{id}로 채운다. */
  const [usedItems, setUsedItems] = useState<UsedItem[]>([]);
  const [isRemixing, setIsRemixing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isItemsOpen, setIsItemsOpen] = useState(false);
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);
  const [toast, setToast] = useState<
    | { kind: 'bookmark'; action: keyof typeof BOOKMARK_TOAST_MESSAGE }
    | { kind: 'error'; message: string }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    getPlacement(post.placementId)
      .then(async (detail) => {
        if (cancelled) return;
        setState({ status: 'ready', detail });
        // 배치 상세를 먼저 그린 뒤 제품을 채운다 — 책상 규격·가져오기 버튼이 제품 조회를
        // 기다릴 이유가 없다. 제품 상세엔 이름·브랜드·가격·이미지가 있고 배치 응답엔 없다
        // (items[].productId만 온다) — 그래서 중복 제거한 id마다 GET /products/{id}를 병렬로 친다.
        // 책상 자체도 "사용된 아이템"에 넣는다(2026-08-06 요청) — 작업실에서 카탈로그 템플릿으로
        // 고른 책상(desk.specSource==='PRODUCT')만 해당한다. 직접 입력 규격(desk.productId===null)은
        // 참조할 카탈로그 제품이 없어 그대로 뺀다.
        const groups = groupItemsByProductId(detail.items);
        const deskProductId = detail.desk.productId;
        const settled = await Promise.all([
          deskProductId !== null
            ? getProductById(deskProductId)
                .then((product): UsedItem => ({ product, quantity: 1 }))
                .catch(() => null)
            : Promise.resolve(null),
          ...groups.map((group) =>
            getProductById(group.productId)
              .then((product): UsedItem => ({ product, quantity: group.quantity }))
              // 비공개·숨김·삭제된 제품은 404다 — 그 카드 하나만 빠지고 섹션은 살린다
              // (카탈로그 전반 원칙: 조용히 빠지는 게 화면을 죽이는 것보다 낫다).
              .catch(() => null),
          ),
        ]);
        if (!cancelled) setUsedItems(settled.filter((item) => item !== null));
      })
      .catch((error: unknown) => {
        // 시드 데이터가 가리키는 배치가 이 환경 DB엔 없을 수도 있다(개발 백엔드마다 다른 시드) —
        // 페이지 전체를 깨뜨리지 않고 이 화면만 조용히 실패 표시로 대체한다.
        if (cancelled) return;
        const code = error instanceof ApiError ? error.problem?.code : undefined;
        setState({
          status: 'error',
          message:
            code === INTERACTION_ERROR_CODES.placementNotFound
              ? PLACEMENT_NOT_FOUND_MESSAGE
              : PLACEMENT_LOAD_ERROR_MESSAGE,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [post.placementId]);

  // 북마크 초기 상태는 서버에서 받는다(댓글은 CollectionComments가 자기 이펙트로 같이 받는다).
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    getPlacementBookmark(post.placementId)
      .then((bookmark) => {
        if (cancelled) return;
        setLoadedBookmarkStatus(bookmark);
      })
      .catch((error: unknown) => {
        // 배치 조회 실패와 같은 자리에 이미 안내가 뜬다 — 여기서 토스트까지 겹치지 않게 로그만 남긴다.
        console.error('[CollectionDetail] 북마크 상태를 불러오지 못했습니다', error);
      });
    return () => {
      cancelled = true;
    };
  }, [post.placementId, isAuthenticated]);

  const handleBookmarkButtonClick = () => {
    if (!requireAuth()) return;
    setIsGroupPickerOpen(true);
  };

  const handleSelectBookmarkGroup = async (groupId: number | null): Promise<void> => {
    const wasBookmarked = bookmarkStatus?.bookmarked === true;
    setIsBookmarkSubmitting(true);
    try {
      await putPlacementBookmark(post.placementId, groupId);
      setLoadedBookmarkStatus({ bookmarked: true, groupId });
      setToast({ kind: 'bookmark', action: wasBookmarked ? 'moved' : 'added' });
      setIsGroupPickerOpen(false);
    } catch (error) {
      console.error('[CollectionDetail] 북마크 저장에 실패했습니다', error);
      const code = error instanceof ApiError ? error.problem?.code : undefined;
      setToast({
        kind: 'error',
        message:
          code === INTERACTION_ERROR_CODES.bookmarkGroupNotFound
            ? '없는 그룹이에요. 목록을 새로고침해주세요.'
            : '북마크를 저장하지 못했어요. 다시 시도해주세요.',
      });
    } finally {
      setIsBookmarkSubmitting(false);
    }
  };

  const handleRemoveBookmark = async (): Promise<void> => {
    setIsBookmarkSubmitting(true);
    try {
      await deletePlacementBookmark(post.placementId);
      setLoadedBookmarkStatus({ bookmarked: false, groupId: null });
      setToast({ kind: 'bookmark', action: 'removed' });
      setIsGroupPickerOpen(false);
    } catch (error) {
      console.error('[CollectionDetail] 북마크 해제에 실패했습니다', error);
      setToast({ kind: 'error', message: '북마크를 해제하지 못했어요. 다시 시도해주세요.' });
    } finally {
      setIsBookmarkSubmitting(false);
    }
  };

  const isBookmarked = bookmarkStatus?.bookmarked === true;

  // 사이드바 드롭다운과 하단 그리드(CollectionUsedItems)는 이 한 배열을 같이 본다 — 조회를 두 번
  // 하지 않는다(종전엔 두 파일이 같은 목업 조회를 각자 했다).
  // 총액은 여기서 계산하지 않는다 — 바로 아래 PlacementEstimateSummary(서버 견적)가 정본이고,
  // 클라이언트 합계를 나란히 두면 404로 빠진 제품만큼 조용히 어긋난 두 숫자가 같이 보인다.

  // 사본은 서버가 항상 내 소유·PRIVATE로 만든다(ADR-0015 결정 10) — 가져온 배치는 내가 다시 올려야
  // 컬렉션에 뜬다. 여기서 토스트로 붙잡지 않고 곧바로 편집 화면으로 보낸다(가져오기의 목적이 편집이다).
  // 내 데스크에서는 버튼이 disabled다 — 서버가 사본을 만들어 주므로 누르면 같은 배치가 작업실에 두 장
  // 생긴다(DERO-366).
  const handleImport = async () => {
    if (!requireAuth()) return;
    setIsRemixing(true);
    try {
      const created = await createPlacementRemix(post.placementId);
      router.push(`/simulator?deskProjectId=${created.id}`);
    } catch (error) {
      console.error('[CollectionDetail] 가져오기에 실패했습니다', error);
      setIsRemixing(false);
      setToast({ kind: 'error', message: '가져오기에 실패했어요. 다시 시도해주세요.' });
    }
  };

  const importButtonLabel = isRemixing ? '가져오는 중...' : '가져오기';

  // 커뮤니티 상세와 같은 규약 — 확인 후 실제 배치를 지운다(craft/CraftDeskCollection.tsx의
  // DeleteConfirmDialog가 아니라 여기선 커뮤니티처럼 window.confirm으로 충분하다: 삭제 대상이
  // 이 화면 하나뿐이라 별도 모달을 새로 만들 이유가 없다).
  const handleDelete = async (): Promise<void> => {
    if (!requireAuth()) return;
    if (!window.confirm('이 데스크를 삭제할까요? 되돌릴 수 없습니다.')) return;
    setIsDeleting(true);
    try {
      await deletePlacement(post.placementId);
      router.push('/collection');
    } catch (error) {
      console.error('[CollectionDetail] 삭제에 실패했습니다', error);
      const status = error instanceof ApiError ? error.status : undefined;
      setToast({
        kind: 'error',
        message:
          status === 403
            ? '내 데스크만 삭제할 수 있어요.'
            : '삭제하지 못했어요. 다시 시도해주세요.',
      });
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-paper min-h-full">
      <div className="mx-auto max-w-[1200px] px-6 pt-8 pb-24 lg:px-[48px]">
        <div className="mb-4">
          <BackButton fallbackHref="/collection" returnHref={returnHref} />
        </div>

        <nav
          aria-label="이동 경로"
          className="text-ash mb-6 flex flex-wrap items-center gap-1.5 text-[14px]"
        >
          <Link href="/collection" className="hover:text-ink transition-colors">
            컬렉션
          </Link>
          <span aria-hidden="true">›</span>
          <span className="text-ink truncate">{post.title}</span>
        </nav>

        <div className="font-swiss grid grid-cols-1 gap-8 tracking-[-0.03em] lg:grid-cols-[1fr_360px]">
          <div className="bg-fog relative aspect-video w-full overflow-hidden rounded-2xl">
            <CollectionCoverImage post={post} sizes="(min-width: 1024px) 60vw, 100vw" priority />
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div>
              <h1 className="text-ink text-[28px] leading-[1.2] font-medium">{post.title}</h1>
            </div>

            <div className="flex items-center gap-2">
              {/* 작성자 프로필로 가는 유일한 진입점이다 — 탈퇴한 작성자(authorId null)는 링크가 없다. */}
              {post.authorId != null ? (
                <Link
                  href={`/users/${post.authorId}`}
                  className="flex items-center gap-2 hover:opacity-80"
                >
                  <PersonAvatar name={post.author} avatarUrl={null} size={32} />
                  <span className="text-ink text-[14px] underline-offset-2 hover:underline">
                    {post.author}
                  </span>
                </Link>
              ) : (
                <>
                  <PersonAvatar name={post.author} avatarUrl={null} size={32} />
                  <span className="text-ink text-[14px]">{post.author}</span>
                </>
              )}
              <span className="text-ash text-[14px] tabular-nums">
                {formatRelativeTime(post.createdAt)}
              </span>
              {isMyPost && (
                <span className="ml-auto flex items-center gap-3">
                  <Link
                    href={`/collection/${post.id}/edit`}
                    className="text-ash hover:text-ink text-[14px]"
                  >
                    수정
                  </Link>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => void handleDelete()}
                    className="text-ash hover:text-danger-500 cursor-pointer text-[14px] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeleting ? '삭제 중' : '삭제'}
                  </button>
                </span>
              )}
            </div>

            {/* 리믹스라면 출처를 밝힌다 — sourcePlacement가 null이면 원본 배치라 아무것도 안 그린다.
                available=false는 원본이 삭제된 경우다: 갈 곳이 없으니 링크 없이 사실만 적는다. */}
            {state.status === 'ready' && state.detail.sourcePlacement !== null && (
              <p className="text-ash text-[13px]">
                {state.detail.sourcePlacement.available ? (
                  <>
                    원본:{' '}
                    <Link
                      href={`/collection/${state.detail.sourcePlacement.id}`}
                      className="text-ink underline underline-offset-4 hover:opacity-70"
                    >
                      {state.detail.sourcePlacement.ownerNickname ?? '알 수 없음'}의{' '}
                      {state.detail.sourcePlacement.title ?? '이름 없는 데스크'}
                    </Link>
                  </>
                ) : (
                  '원본 없음'
                )}
              </p>
            )}

            {state.status === 'ready' && (
              <div className="border-ash/20 flex flex-col gap-3 rounded-[10px] border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-ash text-[13px]">책상 크기</span>
                  <span className="text-ink text-[14px] font-medium">
                    {state.detail.desk.widthMm}×{state.detail.desk.depthMm}×
                    {state.detail.desk.heightMm}mm
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ash text-[13px]">프레임</span>
                  <span className="text-ink text-[14px] font-medium">
                    {FRAME_TYPE_LABEL[state.detail.desk.frameType] ?? state.detail.desk.frameType}
                  </span>
                </div>
              </div>
            )}

            {/* 아이템이 0개여도 섹션 자체는 항상 보여준다(2026-08-06 요청) — 로딩 중엔 usedItems가
                항상 []이라 잠깐 "0개"로 보이는 걸 막으려 state.status==='ready'로만 게이팅한다. */}
            {state.status === 'ready' && (
              <div>
                <button
                  type="button"
                  onClick={() => setIsItemsOpen((prev) => !prev)}
                  aria-expanded={isItemsOpen}
                  className="border-ash/40 text-ink hover:bg-fog flex w-full items-center justify-between rounded-[10px] border px-4 py-2.5 text-[14px] font-medium transition-colors"
                >
                  사용된 아이템 목록 {usedItems.length}개
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className={`transition-transform ${isItemsOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  >
                    <path
                      d="M2.5 4.5 6 8l3.5-3.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {isItemsOpen && (
                  <div className="border-ash/20 mt-2 rounded-[10px] border">
                    {usedItems.length > 0 ? (
                      <ul className="flex h-[108px] flex-col gap-2.5 overflow-y-auto p-3">
                        {usedItems.map(({ product, quantity }) => (
                          <li
                            key={product.id}
                            className="flex items-center justify-between gap-2 text-[14px]"
                          >
                            <Link
                              href={`/product/${product.id}`}
                              className="text-ink focus-visible:outline-primary-600 min-w-0 flex-1 truncate underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                              {product.name}
                              {quantity > 1 && <span className="text-ash"> ×{quantity}</span>}
                            </Link>
                            <span className="text-ash shrink-0 tabular-nums">
                              {product.priceKrw === null
                                ? '가격 미정'
                                : `${(product.priceKrw * quantity).toLocaleString('ko-KR')}원`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-ash flex h-[108px] items-center justify-center text-[13px]">
                        사용된 아이템이 없어요.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 우측 컬럼이 360px 고정이라 태그가 많으면 줄바꿈으로 계속 쌓여 좌측 표지 높이를 넘긴다.
                입력이 COLLECTION_MAX_TAGS로 잠겼으니 신규 글은 여기서 안 잘리고, 상한 이전에 저장된
                사이드카 레코드만 접힌다. 접었을 때 나머지를 볼 방법이 없으면 정보가 사라지므로
                +N은 정적 표시가 아니라 펼치기 버튼이다(사용된 아이템 토글과 같은 패턴).
                2026-08-06: 태그는 이제 라벨이 아니라 링크다 — 눌러서 /collection?tag=로 이동하면
                갤러리가 그 태그로 필터링된 채 열린다(CollectionGallery의 initialTag). */}
            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(isTagsExpanded ? post.tags : post.tags.slice(0, COLLECTION_MAX_TAGS)).map(
                  (tag) => (
                    <Link
                      key={tag}
                      href={`/collection?tag=${encodeURIComponent(tag)}`}
                      className="bg-fog text-ink hover:bg-highlight rounded-full px-3 py-1 text-[14px] transition-colors"
                    >
                      #{tag}
                    </Link>
                  ),
                )}
                {post.tags.length > COLLECTION_MAX_TAGS && (
                  <button
                    type="button"
                    onClick={() => setIsTagsExpanded((prev) => !prev)}
                    aria-expanded={isTagsExpanded}
                    className="border-ash/40 text-ash hover:border-ink hover:text-ink cursor-pointer rounded-full border px-3 py-1 text-[14px] transition-colors"
                  >
                    {isTagsExpanded ? '접기' : `+${post.tags.length - COLLECTION_MAX_TAGS}`}
                  </button>
                )}
              </div>
            )}

            <div className="mt-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleBookmarkButtonClick}
                disabled={isBookmarkSubmitting}
                aria-pressed={isBookmarked}
                aria-label={isBookmarked ? '북마크 그룹 변경' : '북마크'}
                className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isBookmarked
                    ? 'bg-primary-300 text-ink border-transparent'
                    : 'border-ash/40 bg-paper text-ash hover:bg-highlight'
                }`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill={isBookmarked ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.4"
                  aria-hidden="true"
                >
                  <path d="M3.5 2.5h9v11l-4.5-3-4.5 3v-11Z" strokeLinejoin="round" />
                </svg>
              </button>

              {/* 내 데스크는 가져올 수 없다 — 사본이 작업실에 중복으로 쌓인다(DERO-366).
                  버튼을 숨기지 않고 흐리게 두는 건 왜 못 누르는지 title로 설명하기 위해서다. */}
              <button
                type="button"
                disabled={state.status !== 'ready' || isRemixing || isMyPost}
                onClick={() => guardSimulatorEntry(() => void handleImport())}
                title={isMyPost ? '내 데스크테리어는 가져올 수 없어요.' : undefined}
                className="bg-highlight text-ink hover:bg-primary-300 flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] px-4 text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importButtonLabel}
              </button>
            </div>

            {state.status === 'error' && <p className="text-ash text-[13px]">{state.message}</p>}

            {/* 견적(REQ-REC-01) — 서버가 낸 합계만 그린다(예산·초과는 2026-08-02 요청으로 뺐다:
                남의 데스크를 볼 때 그 사람 예산은 볼 이유가 없다). 남의 비공개 배치면 404라
                아무것도 안 그려진다. */}
            <div className="border-ash/30 mt-2 border-t pt-4">
              <PlacementEstimateSummary placementId={post.placementId} showBudget={false} />
            </div>
          </div>
        </div>

        <CollectionUsedItems items={usedItems} />

        {/* 2026-08-06 사용자 요청 — 화면 대비 AI 상상도가 너무 커서 폭을 2/3로 줄이고, 가운데
            정렬한다. 작성자 설명·댓글도 같은 래퍼 안에 둬서 폭과 왼쪽 모서리를 상상도 이미지와
            맞춘다(페이지 컨테이너 기준 왼쪽 정렬이 아니다) — "작성자의 말" 라벨(제목)만 빼고
            내용(post.description)은 그대로 보여준다. */}
        <div className="mx-auto w-2/3">
          <CollectionGeneratedImages placementId={post.placementId} />

          <section className="font-swiss mt-6 tracking-[-0.03em]">
            <p className="text-ink text-[15px] leading-[1.6]">{post.description}</p>
          </section>

          <CollectionRealPhotos placementId={post.placementId} />

          <CollectionComments placementId={post.placementId} />
        </div>
      </div>

      {isGroupPickerOpen && (
        <BookmarkGroupPicker
          isBookmarked={isBookmarked}
          currentGroupId={bookmarkStatus?.groupId ?? null}
          isSubmitting={isBookmarkSubmitting}
          onSelect={(groupId) => void handleSelectBookmarkGroup(groupId)}
          onRemove={() => void handleRemoveBookmark()}
          onClose={() => setIsGroupPickerOpen(false)}
        />
      )}

      {hwaccelPending && (
        <SimulatorEntryWarningDialog
          status={hwaccelPending.status}
          browserKind={hwaccelPending.browserKind}
          onClose={cancelSimulatorEntry}
          onProceedAnyway={proceedSimulatorEntryAnyway}
        />
      )}

      {toast &&
        (toast.kind === 'bookmark' ? (
          <Toast
            message={BOOKMARK_TOAST_MESSAGE[toast.action]}
            actionLabel="북마크 보기"
            onAction={() => {
              setToast(null);
              router.push('/mypage?menu=bookmark');
            }}
            onDismiss={() => setToast(null)}
          />
        ) : (
          <Toast message={toast.message} onDismiss={() => setToast(null)} />
        ))}
    </div>
  );
};

export default CollectionDetail;
