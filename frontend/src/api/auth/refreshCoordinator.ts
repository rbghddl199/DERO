// logical request별 1회 replay와 generation 기반 single-flight refresh를 조정한다.

import { AUTH_ERROR_CODES, type AuthErrorCode } from '@/constants/auth/errorCodes';
import { authFailure, authSuccess } from '@/api/auth/port';
import type { AccessTokenHolder, AccessTokenSnapshot } from '@/api/auth/accessTokenHolder';
import type { AuthFailure, AuthResult } from '@/types/auth';
import { createAuthFailure } from '@/utils/auth/failures';

export interface ProvisionalRefreshCredential {
  accessToken: string;
}

export type LogicalAuthRequest<T> = (token: AccessTokenSnapshot) => Promise<AuthResult<T>>;

interface RefreshCoordinatorOptions {
  accessTokenHolder: AccessTokenHolder;
  refresh: () => Promise<AuthResult<ProvisionalRefreshCredential>>;
  onSessionTerminated: (failure: AuthFailure) => void;
}

export interface RefreshCoordinator {
  execute<T>(request: LogicalAuthRequest<T>): Promise<AuthResult<T>>;
  revoke(failure?: AuthFailure): void;
  resetTermination(): void;
}

// refresh로 회복할 수 없는 실패 — 재시도 없이 세션을 끝낸다.
function isTerminalAuthFailure(code: AuthErrorCode): boolean {
  return code === AUTH_ERROR_CODES.sessionRevoked || code === AUTH_ERROR_CODES.refreshInvalid;
}

function unexpectedFailure(): AuthFailure {
  return createAuthFailure(AUTH_ERROR_CODES.unclassifiedApiError, {
    message: 'Auth 요청 처리 중 분류할 수 없는 오류가 발생했습니다.',
  });
}

export function createRefreshCoordinator(options: RefreshCoordinatorOptions): RefreshCoordinator {
  let refreshPromise: Promise<AuthResult<AccessTokenSnapshot>> | null = null;
  let terminalFailure: AuthFailure | null = null;

  const terminate = (failure: AuthFailure): void => {
    if (terminalFailure !== null) {
      return;
    }
    terminalFailure = failure;
    options.accessTokenHolder.clear();
    options.onSessionTerminated(failure);
  };

  const runRefresh = async (): Promise<AuthResult<AccessTokenSnapshot>> => {
    try {
      const result = await options.refresh();
      if (terminalFailure !== null) {
        return authFailure(terminalFailure);
      }
      if (!result.ok) {
        terminate(result.failure);
        return authFailure(result.failure);
      }

      return authSuccess(options.accessTokenHolder.set(result.data.accessToken));
    } catch {
      const failure = unexpectedFailure();
      terminate(failure);
      return authFailure(failure);
    }
  };

  const refreshOnce = (): Promise<AuthResult<AccessTokenSnapshot>> => {
    if (terminalFailure !== null) {
      return Promise.resolve(authFailure(terminalFailure));
    }
    if (refreshPromise !== null) {
      return refreshPromise;
    }

    const flight = runRefresh();
    refreshPromise = flight;
    void flight.then(() => {
      if (refreshPromise === flight) {
        refreshPromise = null;
      }
    });
    return flight;
  };

  const runLogicalRequest = async <T>(
    request: LogicalAuthRequest<T>,
    token: AccessTokenSnapshot,
  ): Promise<AuthResult<T>> => {
    try {
      return await request(token);
    } catch {
      return authFailure(unexpectedFailure());
    }
  };

  return {
    async execute<T>(request: LogicalAuthRequest<T>): Promise<AuthResult<T>> {
      const initialToken = options.accessTokenHolder.snapshot();
      const initialResult = await runLogicalRequest(request, initialToken);
      if (initialResult.ok) {
        return initialResult;
      }

      if (isTerminalAuthFailure(initialResult.failure.code)) {
        terminate(initialResult.failure);
        return initialResult;
      }
      if (initialResult.failure.code !== AUTH_ERROR_CODES.unauthorized) {
        return initialResult;
      }
      if (terminalFailure !== null) {
        return authFailure(terminalFailure);
      }

      const currentToken = options.accessTokenHolder.snapshot();
      const newerTokenAvailable =
        currentToken.generation !== initialToken.generation && currentToken.accessToken !== null;

      if (!newerTokenAvailable) {
        const refreshResult = await refreshOnce();
        if (!refreshResult.ok) {
          return authFailure(refreshResult.failure);
        }
      }

      if (terminalFailure !== null) {
        return authFailure(terminalFailure);
      }

      const replayResult = await runLogicalRequest(request, options.accessTokenHolder.snapshot());
      if (!replayResult.ok && isTerminalAuthFailure(replayResult.failure.code)) {
        terminate(replayResult.failure);
      }
      return replayResult;
    },

    revoke(failure = createAuthFailure(AUTH_ERROR_CODES.sessionRevoked)) {
      terminate(failure);
    },

    resetTermination() {
      terminalFailure = null;
    },
  };
}
