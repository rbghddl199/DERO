// Access Token을 browser storage 없이 메모리에만 보관하고 generation을 발급한다.

export interface AccessTokenSnapshot {
  accessToken: string | null;
  generation: number;
}

export interface AccessTokenHolder {
  snapshot(): AccessTokenSnapshot;
  set(accessToken: string): AccessTokenSnapshot;
  clear(): AccessTokenSnapshot;
}

export function createMemoryAccessTokenHolder(): AccessTokenHolder {
  let accessToken: string | null = null;
  let generation = 0;

  const snapshot = (): AccessTokenSnapshot => ({ accessToken, generation });

  return {
    snapshot,

    set(nextAccessToken) {
      if (nextAccessToken.length === 0) {
        throw new Error('Access Token은 빈 문자열일 수 없습니다.');
      }
      accessToken = nextAccessToken;
      generation += 1;
      return snapshot();
    },

    clear() {
      accessToken = null;
      generation += 1;
      return snapshot();
    },
  };
}

// actualAdapter가 쓰는 기본 인스턴스 — authRuntime과 같은 모듈 싱글턴 패턴.
export const accessTokenHolder = createMemoryAccessTokenHolder();
