// canonical Auth 상태 전이와 session-preserving forbidden 처리를 소유한다.

import { create } from 'zustand';
import { AUTH_ERROR_CODES } from '@/constants/auth/errorCodes';
import type { AuthFailure, AuthState, UserSession } from '@/types/auth';

interface AuthStore {
  auth: AuthState;
  startLoading: () => void;
  setAuthenticated: (session: UserSession) => void;
  setAnonymous: (failure?: AuthFailure | null) => void;
  setError: (failure: AuthFailure) => void;
  handleFailure: (failure: AuthFailure) => void;
  reset: () => void;
}

const UNKNOWN_AUTH_STATE: AuthState = {
  status: 'unknown',
  session: null,
  failure: null,
};

function currentSession(auth: AuthState): UserSession | null {
  return auth.status === 'authenticated' || auth.status === 'loading' || auth.status === 'error'
    ? auth.session
    : null;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  auth: UNKNOWN_AUTH_STATE,

  startLoading() {
    set({
      auth: {
        status: 'loading',
        session: currentSession(get().auth),
        failure: null,
      },
    });
  },

  setAuthenticated(session) {
    set({
      auth: {
        status: 'authenticated',
        session,
        failure: null,
      },
    });
  },

  setAnonymous(failure = null) {
    set({
      auth: {
        status: 'anonymous',
        session: null,
        failure,
      },
    });
  },

  setError(failure) {
    set({
      auth: {
        status: 'error',
        session: currentSession(get().auth),
        failure,
      },
    });
  },

  handleFailure(failure) {
    const auth = get().auth;
    if (failure.code === AUTH_ERROR_CODES.forbidden && auth.status === 'authenticated') {
      set({
        auth: {
          status: 'authenticated',
          session: auth.session,
          failure,
        },
      });
      return;
    }

    if (
      failure.code === AUTH_ERROR_CODES.sessionRevoked ||
      failure.code === AUTH_ERROR_CODES.refreshInvalid ||
      failure.code === AUTH_ERROR_CODES.unauthorized
    ) {
      get().setAnonymous(failure);
      return;
    }

    get().setError(failure);
  },

  reset() {
    set({ auth: UNKNOWN_AUTH_STATE });
  },
}));
