// OAuth 표현 컴포넌트의 상태·타입·접근성 마크업 계약을 순수 렌더링으로 검증한다.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, expectTypeOf, it } from 'vitest';

import AuthBoundary from '@/components/auth/AuthBoundary';
import OAuthCallbackPanel from '@/components/auth/OAuthCallbackPanel';
import OAuthEntryPanel from '@/components/auth/OAuthEntryPanel';
import OAuthProviderButton, {
  isOAuthProviderButtonActivationBlocked,
} from '@/components/auth/OAuthProviderButton';
import type {
  AuthBoundaryStatus,
  OAuthCallbackStatus,
  OAuthIntent,
  OAuthProvider,
  OAuthProviderButtonStatus,
} from '@/types/auth-ui';

describe('OAuth UI type contract', () => {
  it('provider, intent, status union을 허용 값으로 제한한다', () => {
    expectTypeOf<OAuthProvider>().toEqualTypeOf<'google' | 'kakao'>();
    expectTypeOf<OAuthIntent>().toEqualTypeOf<'login' | 'signup'>();
    expectTypeOf<OAuthProviderButtonStatus>().toEqualTypeOf<
      'idle' | 'loading' | 'disabled' | 'error'
    >();
    expectTypeOf<OAuthCallbackStatus>().toEqualTypeOf<'processing' | 'success' | 'failure'>();
    expectTypeOf<AuthBoundaryStatus>().toEqualTypeOf<
      'checking' | 'anonymous' | 'authenticated' | 'error'
    >();
  });
});

describe('OAuthProviderButton', () => {
  it('loading과 disabled 상태의 activation을 차단한다', () => {
    expect(isOAuthProviderButtonActivationBlocked('loading')).toBe(true);
    expect(isOAuthProviderButtonActivationBlocked('disabled')).toBe(true);
    expect(isOAuthProviderButtonActivationBlocked('idle')).toBe(false);
    expect(isOAuthProviderButtonActivationBlocked('error')).toBe(false);
  });

  it('loading 상태를 접근 가능한 비활성 버튼으로 표시한다', () => {
    const html = renderToStaticMarkup(
      createElement(OAuthProviderButton, {
        provider: 'google',
        intent: 'login',
        status: 'loading',
        onActivate: () => undefined,
      }),
    );

    expect(html).toContain('data-provider="google"');
    expect(html).toContain('data-status="loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Google 로그인 중');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('/assets/auth/google-g.svg');
  });

  it('error 상태를 알리고 retry activation은 허용한다', () => {
    const html = renderToStaticMarkup(
      createElement(OAuthProviderButton, {
        provider: 'kakao',
        intent: 'signup',
        status: 'error',
        errorMessage: 'Kakao 인증 준비에 실패했습니다.',
        onActivate: () => undefined,
      }),
    );

    expect(html).toContain('카카오 로그인 다시 시도');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Kakao 인증 준비에 실패했습니다.');
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('/assets/auth/kakao-login-symbol.svg');
    expect(html).toContain('cursor-pointer');
  });
});

describe('OAuthEntryPanel', () => {
  it('요청 intent에 Google과 Kakao만 표시한다', () => {
    const html = renderToStaticMarkup(
      createElement(OAuthEntryPanel, {
        intent: 'signup',
        onProviderSelect: () => undefined,
      }),
    );

    expect(html).toContain('data-intent="signup"');
    expect(html).toContain('data-provider="google"');
    expect(html).toContain('data-provider="kakao"');
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('Google 로그인');
    expect(html).toContain('카카오 로그인');
  });

  it('한 provider가 loading이면 다른 provider를 비활성화한다', () => {
    const html = renderToStaticMarkup(
      createElement(OAuthEntryPanel, {
        intent: 'login',
        providerStatuses: { google: 'loading' },
        onProviderSelect: () => undefined,
      }),
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-provider="google" data-intent="login" data-status="loading"');
    expect(html).toContain('data-provider="kakao" data-intent="login" data-status="disabled"');
  });
});

describe('OAuthCallbackPanel', () => {
  it.each<OAuthCallbackStatus>(['processing', 'success', 'failure'])(
    '%s callback 상태를 공통 feedback component로 표시한다',
    (status) => {
      const html = renderToStaticMarkup(
        createElement(OAuthCallbackPanel, {
          status,
          onRetry: () => undefined,
        }),
      );

      expect(html).toContain(`data-status="${status}"`);

      if (status === 'processing') {
        expect(html).toContain('role="status"');
      }

      if (status === 'success') {
        expect(html).toContain('data-variant="success"');
      }

      if (status === 'failure') {
        expect(html).toContain('role="alert"');
        expect(html).toContain('다시 인증');
      }
    },
  );
});

describe('AuthBoundary', () => {
  it('checking, anonymous, authenticated, error 표현을 분리한다', () => {
    const checkingHtml = renderToStaticMarkup(
      createElement(
        AuthBoundary,
        { status: 'checking' } as Parameters<typeof AuthBoundary>[0],
        '보호 콘텐츠',
      ),
    );
    const anonymousHtml = renderToStaticMarkup(
      createElement(
        AuthBoundary,
        {
          status: 'anonymous',
          anonymousAction: createElement('button', { type: 'button' }, '로그인 화면으로'),
        } as Parameters<typeof AuthBoundary>[0],
        '보호 콘텐츠',
      ),
    );
    const authenticatedHtml = renderToStaticMarkup(
      createElement(
        AuthBoundary,
        { status: 'authenticated' } as Parameters<typeof AuthBoundary>[0],
        createElement('p', null, '보호 콘텐츠'),
      ),
    );
    const errorHtml = renderToStaticMarkup(
      createElement(
        AuthBoundary,
        {
          status: 'error',
          onRetry: () => undefined,
        } as Parameters<typeof AuthBoundary>[0],
        '보호 콘텐츠',
      ),
    );

    expect(checkingHtml).toContain('role="status"');
    expect(anonymousHtml).toContain('data-auth-status="anonymous"');
    expect(anonymousHtml).toContain('로그인 화면으로');
    expect(anonymousHtml).not.toContain('보호 콘텐츠');
    expect(authenticatedHtml).toContain('보호 콘텐츠');
    expect(errorHtml).toContain('data-auth-status="error"');
    expect(errorHtml).toContain('role="alert"');
  });
});
