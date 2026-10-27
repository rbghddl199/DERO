'use client';
// 배치 업로드(컬렉션 공개)로 PENDING이 된 배치를 화면과 무관하게 감시해 완료·실패 알림을 만든다.
// 진행 조회 엔드포인트가 없어 `GET /placements/{id}`를 되풀이한다(ADR-0015 결정 10) — 종전에는
// /craft 카드(DeskPublishControl)가 폴링했지만, 그 화면을 떠나면 완료 알림이 오지 않았다. 그래서
// 루트 레이아웃의 부트스트랩 자리(AuthBootstrap·PersistedInteractionsBootstrap과 같은 자리)로 올렸다.

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
import { getPlacement } from '@/api/placement';
import { PUBLISH_POLL_INTERVAL_MS, PUBLISH_POLL_TIMEOUT_MS } from '@/constants/placementPublish';
import { useAuthStore } from '@/store/authStore';
import { useUploadNotificationsStore } from '@/store/uploadNotificationsStore';

const UploadWatcherBootstrap = () => {
  const pathname = usePathname();
  const session = useAuthStore((s) => s.auth.session);
  const watches = useUploadNotificationsStore((s) => s.watches);
  const [isHydrated, setIsHydrated] = useState(() =>
    useUploadNotificationsStore.persist.hasHydrated(),
  );
  /** 응답이 느린 배치에 요청을 겹쳐 쌓지 않는다 — 워커가 노트북이라 3초보다 오래 걸릴 수 있다. */
  const inFlightRef = useRef<Set<number>>(new Set());

  // 파생값은 셀렉터가 아니라 본문에서 만든다 — 셀렉터에서 배열·객체를 만들면 스냅샷마다 새 참조라
  // useSyncExternalStore가 무한 리렌더한다(frontend/CLAUDE.md).
  const ownerId = session?.userId ?? null;
  const hasWatches = watches.some((watch) => watch.ownerId === ownerId);
  // 썸네일 캡처 라우트에서는 네트워크를 태우지 않는다(WebVitalsOverlay와 같은 예외). /simulator 자체는
  // 제외하지 않는다 — 아무것도 렌더하지 않고, 그 화면에서도 완료 알림은 와야 한다.
  const isCaptureRoute = pathname === '/simulator/thumbnail-render';

  // 감시 목록이 localStorage에서 복원되기 전에 폴링을 시작하면 재개 대상이 비어 보인다.
  // rehydrate가 Promise라 부트스트랩 마운트 순서만으로는 보장되지 않아 여기서 직접 기다린다
  // (CollectionDetailGate와 같은 가드 패턴 — setState는 콜백 안에서만 호출한다).
  useEffect(() => {
    if (isHydrated) return;

    if (useUploadNotificationsStore.persist.hasHydrated()) {
      const timer = setTimeout(() => setIsHydrated(true), 0);
      return () => clearTimeout(timer);
    }

    return useUploadNotificationsStore.persist.onFinishHydration(() => setIsHydrated(true));
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated || ownerId === null || !hasWatches || isCaptureRoute) return;

    let cancelled = false;
    const timer = setInterval(() => {
      // 클로저의 watches가 아니라 getState()로 다시 읽는다 — 이 이펙트는 "감시할 게 있냐"(boolean)로만
      // 재구독되므로, 한 건이 해소돼도 타이머가 리셋되지 않고 그 사이 추가된 항목도 같이 본다.
      for (const watch of useUploadNotificationsStore.getState().watches) {
        if (watch.ownerId !== ownerId) continue;
        if (inFlightRef.current.has(watch.placementId)) continue;
        inFlightRef.current.add(watch.placementId);

        getPlacement(watch.placementId)
          .then((detail) => {
            if (cancelled) return;
            const store = useUploadNotificationsStore.getState();
            if (detail.publishStatus === 'PUBLIC') {
              store.resolveWatch(watch.placementId, 'succeeded');
              return;
            }
            if (detail.publishStatus === 'FAILED') {
              store.resolveWatch(watch.placementId, 'failed');
              return;
            }
            // 사용자가 스스로 공개를 취소했다 — 알릴 게 없으니 조용히 감시만 접는다.
            if (detail.publishStatus === 'PRIVATE') {
              store.dropWatch(watch.placementId);
              return;
            }
            // 남는 건 PENDING뿐. 데드라인을 넘겼으면 알림 없이 감시만 접는다 — '아직 처리 중'
            // 알림은 결과가 아니라 우리 사정이라 소음이었다(2026-08-02 요청으로 삭제).
            // 데드라인은 **PENDING을 확인한 뒤에만** 잰다 — 먼저 재면 탭을 오래 닫아 뒀다 돌아온
            // 사용자의 이미 PUBLIC인 배치를 확인도 없이 접어 완료 알림을 통째로 잃는다.
            if (isPastDeadline(watch.startedAt)) {
              store.dropWatch(watch.placementId);
            }
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            const store = useUploadNotificationsStore.getState();
            // 배치가 지워졌다 — 알림 없이 감시만 접는다.
            if (error instanceof ApiError && error.status === 404) {
              store.dropWatch(watch.placementId);
              return;
            }
            // 그 밖의 실패(네트워크·5xx)로는 상태를 뒤집지 않는다(DeskPublishControl과 같은 판단).
            // 다만 오프라인이 영원히 폴링하지 않도록 데드라인은 여기서도 적용한다 — 실패로 단정하지
            // 않으므로 알림 없이 감시만 접는다.
            if (isPastDeadline(watch.startedAt)) {
              store.dropWatch(watch.placementId);
            }
          })
          .finally(() => {
            inFlightRef.current.delete(watch.placementId);
          });
      }
    }, PUBLISH_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isHydrated, ownerId, hasWatches, isCaptureRoute]);

  return null;
};

/** startedAt은 epoch ms로 저장돼 있어 새로고침·탭 재개에도 절대 시각 기준으로 판정된다. */
const isPastDeadline = (startedAt: number): boolean =>
  Date.now() - startedAt > PUBLISH_POLL_TIMEOUT_MS;

export default UploadWatcherBootstrap;
