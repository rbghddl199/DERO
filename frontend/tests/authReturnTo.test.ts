// returnTo sanitizer·one-time repository와 memory-only Access Token 보관을 검증한다.

import { describe, expect, it, vi } from 'vitest';
import { createMemoryAccessTokenHolder } from '@/api/auth/accessTokenHolder';
import {
  createReturnToRepository,
  RETURN_TO_STORAGE_KEY,
  type StorageLike,
} from '@/utils/auth/returnToRepository';
import { sanitizeReturnTo } from '@/utils/auth/returnTo';

class MemoryStorage implements StorageLike {
  readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

describe('sanitizeReturnTo', () => {
  it('same-origin relative path의 query와 fragment를 유지한다', () => {
    expect(sanitizeReturnTo('/craft?tab=mine#latest')).toBe('/craft?tab=mine#latest');
    expect(sanitizeReturnTo('/product/42')).toBe('/product/42');
  });

  it.each([
    'https://evil.example/path',
    'http://evil.example/path',
    '//evil.example/path',
    '\\\\evil.example\\path',
    'javascript:alert(1)',
    'craft',
    '/%2f%2fevil.example',
  ])('external 또는 protocol-relative 입력 %s를 /로 fallback한다', (candidate) => {
    expect(sanitizeReturnTo(candidate)).toBe('/');
  });

  it.each([
    '/login',
    '/login?returnTo=/craft',
    '/signup/',
    '/auth/callback',
    '/auth/callback/result',
    '/%6cogin',
    '/auth/%2563allback',
  ])('Auth recursion 입력 %s를 /로 fallback한다', (candidate) => {
    expect(sanitizeReturnTo(candidate)).toBe('/');
  });
});

describe('returnTo sessionStorage repository', () => {
  it('sanitized destination 하나만 저장하고 one-time consume한다', () => {
    const storage = new MemoryStorage();
    const repository = createReturnToRepository(storage);

    expect(repository.save('/craft?tab=mine')).toBe('/craft?tab=mine');
    expect([...storage.entries]).toEqual([[RETURN_TO_STORAGE_KEY, '/craft?tab=mine']]);
    expect(repository.consume()).toBe('/craft?tab=mine');
    expect(repository.consume()).toBeNull();
    expect(storage.entries.size).toBe(0);
  });

  it('unsafe destination은 sanitized /만 저장한다', () => {
    const storage = new MemoryStorage();
    const repository = createReturnToRepository(storage);

    repository.save('https://evil.example');
    expect([...storage.entries]).toEqual([[RETURN_TO_STORAGE_KEY, '/']]);
  });
});

describe('memory-only Access Token holder', () => {
  it('generation을 갱신하고 localStorage·sessionStorage를 호출하지 않는다', () => {
    const localSetItem = vi.fn();
    const sessionSetItem = vi.fn();
    const localDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const sessionDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { setItem: localSetItem },
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: { setItem: sessionSetItem },
    });

    try {
      const holder = createMemoryAccessTokenHolder();
      const volatileCredential = globalThis.crypto.randomUUID();

      expect(holder.snapshot()).toEqual({ accessToken: null, generation: 0 });
      expect(holder.set(volatileCredential)).toEqual({
        accessToken: volatileCredential,
        generation: 1,
      });
      expect(holder.clear()).toEqual({ accessToken: null, generation: 2 });
      expect(localSetItem).not.toHaveBeenCalled();
      expect(sessionSetItem).not.toHaveBeenCalled();
    } finally {
      if (localDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', localDescriptor);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
      if (sessionDescriptor) {
        Object.defineProperty(globalThis, 'sessionStorage', sessionDescriptor);
      } else {
        delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
      }
    }
  });
});
