// OAuth 진입·콜백·인증 경계 표현 컴포넌트가 공유하는 순수 UI 상태 타입을 정의한다.

export type OAuthProvider = 'google' | 'kakao';

export type OAuthIntent = 'login' | 'signup';

export type OAuthProviderButtonStatus = 'idle' | 'loading' | 'disabled' | 'error';

export type OAuthCallbackStatus = 'processing' | 'success' | 'failure';

export type AuthBoundaryStatus = 'checking' | 'anonymous' | 'authenticated' | 'error';
