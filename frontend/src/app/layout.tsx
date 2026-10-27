// 전역 구조를 보존하면서 Auth bootstrap을 최소 mount한다.

import type { Metadata } from 'next';
import AuthBootstrap from '@/components/auth/AuthBootstrap';
import Footer from '@/components/layout/Footer';
import TopNavbar from '@/components/layout/TopNavbar';
import CookieConsentBanner from '@/components/common/CookieConsentBanner';
import GoogleAnalyticsBootstrap from '@/components/common/GoogleAnalyticsBootstrap';
import PersistedInteractionsBootstrap from '@/components/common/PersistedInteractionsBootstrap';
import ScrollToTopButton from '@/components/common/ScrollToTopButton';
import TransitionNavigator from '@/components/common/TransitionNavigator';
import UploadWatcherBootstrap from '@/components/common/UploadWatcherBootstrap';
// 통짜 PretendardVariable.woff2(2.0MB)가 아니라 unicode-range로 92분할된 dynamic-subset을 쓴다 —
// 브라우저가 화면에 실제로 쓰인 글자의 서브셋만 받는다(DERO-607). 패밀리 이름은
// 'Pretendard Variable'이고 globals.css의 --font-pretendard가 이를 가리킨다.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';

export const metadata: Metadata = {
  title: '데스크테리어 시뮬레이터',
  description: '실측 규격 기반 3D 데스크 시뮬레이터',
  icons: {
    icon: '/dero_logo_black.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <AuthBootstrap />
        <PersistedInteractionsBootstrap />
        <UploadWatcherBootstrap />
        <GoogleAnalyticsBootstrap />
        <TransitionNavigator />
        <TopNavbar />
        <main className="flex flex-1 flex-col">{children}</main>
        <Footer />
        <ScrollToTopButton />
        <CookieConsentBanner />
      </body>
    </html>
  );
}
