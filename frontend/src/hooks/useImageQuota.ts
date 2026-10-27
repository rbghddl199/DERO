'use client';
// 오늘 쓴 이미지 장수·상한·리셋 시각을 읽어 온다(`GET /users/me/image-quota`, 로그인 전용).
//
// 업로드가 429를 던진 직후에도 같은 값을 다시 읽어야 해서(그 시점 잔여가 0으로 확정된다) 조회를
// 컴포넌트가 아니라 이 훅이 소유하고 `refresh`를 밖으로 준다.

import { useCallback, useEffect, useState } from 'react';
import { getImageQuota } from '@/api/user';
import { useAuthStore } from '@/store/authStore';
import type { ImageQuotaResponse } from '@/types/user';

export interface ImageQuotaHandle {
  quota: ImageQuotaResponse | null;
  isLoading: boolean;
  /** 업로드 성공·429 직후에 부른다 — 서버 값이 정본이라 클라이언트가 usedToday를 계산하지 않는다. */
  refresh: () => void;
}

export function useImageQuota(): ImageQuotaHandle {
  const isAuthenticated = useAuthStore((s) => s.auth.status === 'authenticated');
  const [quota, setQuota] = useState<ImageQuotaResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // "로딩 중"을 별도 boolean state로 두면 이펙트 본문에서 켜야 해서
  // react-hooks/set-state-in-effect에 걸린다 — 어느 회차까지 끝났는지만 기록하고 파생시킨다.
  const [settledToken, setSettledToken] = useState(-1);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  // setState는 전부 콜백 안에서만 부른다(DeskPublishControl과 같은 형태).
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    getImageQuota()
      .then((next) => {
        if (!cancelled) setQuota(next);
      })
      .catch(() => {
        // 한도 표시는 부가 정보다 — 못 읽었다고 화면을 오류로 덮지 않는다(업로드는 그대로 시도된다).
      })
      .finally(() => {
        if (!cancelled) setSettledToken(reloadToken);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, reloadToken]);

  return { quota, isLoading: isAuthenticated && settledToken !== reloadToken, refresh };
}
