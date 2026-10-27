'use client';
// 좌측 레일 '찜' 카테고리 플라이아웃 — 좋아요한 제품만 모아 보여준다(2026-08-06 신규,
// 사용자 요청). 좋아요 상태는 /product 카탈로그·마이페이지 찜하기와 같은
// productLikesStore를 그대로 구독한다. mock 모드는 정적 PRODUCTS인 libraryItems()를 그 id로
// 거른다(GLB 라이브러리는 좋아요 대상이 아니라 제외).
// 카드 드래그 배치·무한 스크롤은 LibraryPanel의 GallerySection을 그대로 재사용한다.
//
// real 모드에서는 **서버 응답의 제품을 직접 변환해 그린다**(마이페이지 찜하기와 같은 계약).
// 예전엔 여기서도 libraryItems()를 좋아요 id로 걸렀는데, 그건 "시뮬레이터는 setCatalog()이 real
// 카탈로그를 통째로 적재해 뒀다"는 전제였고 DERO-374에서 카탈로그가 커서 페이징으로 바뀌며
// 깨졌다 — real 부팅은 setCatalog([])로 시작하고 LibraryPanel(제품 플라이아웃)이 마운트한
// useCatalogPage만 페이지를 이어 붙이므로, 제품 탭을 안 열었으면 대조할 카탈로그가 0건이라
// 찜 목록이 **항상 비어 보였다**.
//
// 대신 변환한 spec을 appendCatalog로 엔진 카탈로그에도 넣는다 — 드래그 배치(attachLibraryDrag)가
// pointerdown에서 getProduct(specId)로 엔진을 조회하므로, 빠뜨리면 카드는 떠도 못 놓는다.
// (마이페이지는 엔진이 없어 이 단계가 없다 — 갈리는 지점이 여기다.)

import { useEffect, useState } from 'react';
import { isMockApi } from '@/constants/api';
import { toProductSpec } from '@/three/scene/catalogAdapter';
import { appendCatalog, libraryItems, type ProductSpec } from '@/three/scene/product';
import { useProductLikesStore } from '@/store/productLikesStore';
import { useSimulatorStore } from '@/store/simulatorStore';
import Toast from '@/components/common/Toast';
import { requestSimulatorExitNavigation } from '@/utils/simulatorExit';
import { GallerySection, type GalleryEntry } from './LibraryPanel';

/** productLikesStore는 skipHydration:true라 마운트 직후엔 아직 localStorage 복원 전일 수
 *  있다 — 복원 전에 "좋아요 없음"을 잠깐 보여주면 깜빡임으로 보이므로 하이드레이션 완료까지
 *  기다린다. ProductWishlistPanel.tsx와 같은 이유·같은 구현(setTimeout(…, 0)으로 미루는
 *  이유: effect 본문에서 곧바로 setState를 부르면 react-hooks/set-state-in-effect 린트가
 *  캐스케이드 렌더 위험으로 막는다). */
const useLikesHydrated = (): boolean => {
  const [isHydrated, setIsHydrated] = useState(() => useProductLikesStore.persist.hasHydrated());

  useEffect(() => {
    if (isHydrated) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const markHydrated = () => {
      timer ??= setTimeout(() => setIsHydrated(true), 0);
    };

    if (useProductLikesStore.persist.hasHydrated()) {
      markHydrated();
      return () => {
        if (timer) clearTimeout(timer);
      };
    }

    const unsubscribe = useProductLikesStore.persist.onFinishHydration(markHydrated);

    // 구독 사이 틈에 하이드레이션이 끝났을 수 있어 다시 한번 확인한다.
    if (useProductLikesStore.persist.hasHydrated()) {
      markHydrated();
    }

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [isHydrated]);

  return isHydrated;
};

/**
 * real 모드의 찜 목록 — 서버가 준 제품을 카드가 아는 `ProductSpec`으로 옮긴다.
 *
 * 스토어의 sync를 거친다(`getLikedProducts()`를 직접 부르지 않는다) — 좋아요 id와 카드 목록이 같은
 * 응답에서 나와야 둘이 어긋나지 않는다. 마이페이지가 스토어를 경유하는 것과 같은 이유다.
 *
 * `null`이면 아직 답이 없다는 뜻(로딩)이다. `/simulator`는 AuthGate 뒤라 항상 로그인 상태이므로
 * 마이페이지와 달리 인증 확정을 따로 기다리지 않는다(`?liked=me`는 비로그인 401이다).
 */
const useServerLikedSpecs = (): { specs: ProductSpec[] | null; loadError: boolean } => {
  const deskTextures = useSimulatorStore((s) => s.deskTextures);
  const [specs, setSpecs] = useState<ProductSpec[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (isMockApi()) return;

    let cancelled = false;
    const load = async () => {
      try {
        const liked = await useProductLikesStore.getState().syncFromServer();
        const mapped = (
          await Promise.all(liked.map((dto) => toProductSpec(dto, deskTextures)))
        ).filter((spec): spec is ProductSpec => spec !== null);
        // 드래그 배치가 getProduct(specId)로 찾는 곳이 여기다 — 넣지 않으면 카드는 떠도 못 놓는다.
        // mock 모드(CATALOG===null)에서는 no-op이라 분기 없이 안전하다.
        appendCatalog(mapped);
        // 책상은 드래그 대상이 아니다 — libraryItems()·라이브러리 갤러리와 같은 규칙.
        if (!cancelled) setSpecs(mapped.filter((spec) => spec.kind !== 'surface'));
      } catch (error: unknown) {
        console.error('[LikedProductsPanel] 찜 목록 조회 실패', error);
        if (!cancelled) setLoadError(true);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [deskTextures]);

  return { specs, loadError };
};

const StableLikedProductsGallery = ({
  specs,
  emptyMessage,
}: {
  specs: ProductSpec[];
  emptyMessage: string;
}) => {
  const [visibleSpecs] = useState(() => specs);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const entries: GalleryEntry[] = visibleSpecs.map((spec) => ({ kind: 'local' as const, spec }));

  return (
    <>
      <GallerySection
        entries={entries}
        testId="hud-liked-gallery"
        emptyMessage={emptyMessage}
        showLikeButton
        onLikeChange={(isLiked) =>
          setToastMessage(isLiked ? '좋아요에 추가되었습니다.' : '좋아요를 해제했습니다.')
        }
      />
      {toastMessage !== null && (
        <Toast
          message={toastMessage}
          actionLabel="좋아요 목록 보기"
          actionColorClassName="text-danger-500"
          onAction={() => {
            setToastMessage(null);
            requestSimulatorExitNavigation('/mypage?menu=wishlist');
          }}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </>
  );
};

const LikedProductsPanel = () => {
  const likedIds = useProductLikesStore((s) => s.likedIds);
  const isHydrated = useLikesHydrated();
  const { specs: serverSpecs, loadError } = useServerLikedSpecs();

  // mock은 localStorage 복원을, real은 서버 응답을 기다린다. real에서 로컬 복원까지 기다리면
  // 서버 값을 이미 받아 놓고도 화면이 비어 있게 된다(ProductWishlistPanel과 같은 근거).
  const isPending = isMockApi() ? !isHydrated : serverSpecs === null && !loadError;

  const likedSpecs = isMockApi()
    ? libraryItems().filter((spec) => likedIds.has(spec.id))
    : (serverSpecs ?? []);

  return (
    <div className="hud-liked" data-testid="hud-liked">
      <div className="liked-header">
        <span className="liked-header-title">찜한 제품</span>
      </div>

      {isPending ? (
        <div className="hud-gallery-inner">
          <p className="lib-empty">좋아요 확인 중…</p>
        </div>
      ) : (
        <StableLikedProductsGallery
          specs={likedSpecs}
          emptyMessage={loadError ? '찜 목록을 불러오지 못했습니다' : '좋아요한 제품이 없습니다'}
        />
      )}
    </div>
  );
};

export default LikedProductsPanel;
