// API_BASE_URL은 실행 컨텍스트로 갈린다 — 브라우저는 상대 경로(동일 오리진), RSC는 절대 오리진.
// apiMode.test.ts와 같은 이유로 stubEnv + resetModules로 매번 새로 import한다. 환경은 node라
// window가 없어 기본이 서버 분기이며, 브라우저 분기는 stubGlobal로 window를 만들어 검증한다.
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('API_BASE_URL 오리진 분기', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('배포 브라우저: NEXT_PUBLIC_API_BASE_URL이 빈 문자열이면 상대 경로가 된다', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { API_BASE_URL, API_ORIGIN } = await import('@/constants/api');
    // 절대 URL이면 페이지 오리진과 어긋날 수 있다 — 2026-08-03 CORS 장애의 원인이었다.
    expect(API_BASE_URL).toBe('/api/v1');
    expect(API_ORIGIN).toBe('');
  });

  it('배포 서버(RSC): INTERNAL_API_ORIGIN을 절대 오리진으로 쓴다', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    vi.stubEnv('INTERNAL_API_ORIGIN', 'http://backend:8080');
    vi.resetModules();
    const { API_BASE_URL } = await import('@/constants/api');
    // Node fetch는 상대 경로를 못 받는다 — 여기서 상대 경로가 나오면 서버 렌더가 죽는다.
    expect(API_BASE_URL).toBe('http://backend:8080/api/v1');
  });

  it('INTERNAL_API_ORIGIN이 없으면 서버도 브라우저 오리진으로 떨어진다(로컬 개발)', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:8080');
    vi.resetModules();
    const { API_BASE_URL } = await import('@/constants/api');
    expect(API_BASE_URL).toBe('http://localhost:8080/api/v1');
  });

  it('env가 아예 없으면 로컬 백엔드가 기본값이다', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', undefined);
    vi.stubEnv('INTERNAL_API_ORIGIN', undefined);
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { API_BASE_URL } = await import('@/constants/api');
    expect(API_BASE_URL).toBe('http://localhost:8080/api/v1');
  });
});
