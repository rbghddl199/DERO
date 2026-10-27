// Backend OAuth 성공 redirect의 고정 /auth/callback 화면을 제공한다.

import AuthCallbackRoute from '@/components/auth/AuthCallbackRoute';

const AuthCallbackPage = () => (
  <div className="bg-paper flex flex-1 items-center justify-center px-6 py-12">
    <AuthCallbackRoute />
  </div>
);

export default AuthCallbackPage;
