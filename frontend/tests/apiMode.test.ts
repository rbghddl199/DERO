// API_MODE는 모듈 로드 시점에 env를 한 번 읽으므로, 값을 바꿔가며 검증하려면
// vi.stubEnv + resetModules로 매번 새로 import해야 한다(이 파일에서 처음 쓰는 패턴).
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('API_MODE', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("'real'이 아닌 값은 전부 mock으로 fail-closed한다", async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'production');
    vi.resetModules();
    const { API_MODE, isMockApi } = await import('@/constants/api');
    expect(API_MODE).toBe('mock');
    expect(isMockApi()).toBe(true);
  });

  it('빈 문자열도 mock으로 취급한다(설정 안 한 경우와 동일)', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', '');
    vi.resetModules();
    const { API_MODE } = await import('@/constants/api');
    expect(API_MODE).toBe('mock');
  });

  it("정확히 'real'일 때만 real로 전환된다", async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MODE', 'real');
    vi.resetModules();
    const { API_MODE, isMockApi } = await import('@/constants/api');
    expect(API_MODE).toBe('real');
    expect(isMockApi()).toBe(false);
  });
});
