// sanitized returnTo 하나만 sessionStorage에 저장하고 한 번만 소비한다.

import { sanitizeReturnTo } from '@/utils/auth/returnTo';

export const RETURN_TO_STORAGE_KEY = 'dero.auth.returnTo';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ReturnToRepository {
  save(candidate: string | null | undefined): string;
  consume(): string | null;
  clear(): void;
}

function browserSessionStorage(): StorageLike | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function createReturnToRepository(
  storage: StorageLike | null = browserSessionStorage(),
): ReturnToRepository {
  return {
    save(candidate) {
      const returnTo = sanitizeReturnTo(candidate);
      try {
        storage?.setItem(RETURN_TO_STORAGE_KEY, returnTo);
      } catch {
        // 저장소가 차단돼도 unsafe destination을 대신 보존하지 않는다.
      }
      return returnTo;
    },

    consume() {
      if (!storage) {
        return null;
      }

      try {
        const stored = storage.getItem(RETURN_TO_STORAGE_KEY);
        storage.removeItem(RETURN_TO_STORAGE_KEY);
        return stored === null ? null : sanitizeReturnTo(stored);
      } catch {
        return null;
      }
    },

    clear() {
      try {
        storage?.removeItem(RETURN_TO_STORAGE_KEY);
      } catch {
        // 저장소 접근 실패는 caller의 Auth 상태를 바꾸지 않는다.
      }
    },
  };
}
