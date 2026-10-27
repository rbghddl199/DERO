'use client';
// 전역 하단 Footer — 로고/카피, 사이트 내비 링크, 약관 링크와 쿠키 설정, 회사정보를 표시.
// /simulator에서는 TopNavbar와 같은 이유로 자체 숨김(풀뷰포트 3D 캔버스를 가리지 않도록).

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import DeroLogo from '@/assets/dero_logo.svg';
import { FOOTER_COPY } from '@/constants/footerCopy';
import { useCookieConsentStore } from '@/store/cookieConsentStore';

const Footer = () => {
  const pathname = usePathname();
  const setDecision = useCookieConsentStore((state) => state.setDecision);

  // 결정을 지우면 CookieConsentBanner가 다시 뜨고 GoogleAnalyticsBootstrap이 GA를 안 태운다. 다만
  // 언마운트만으로는 이미 주입된 gtag 전역이 남으므로 리로드해야 실제로 추적이 멈춘다.
  const handleOpenCookieSettings = () => {
    setDecision(null);
    window.location.reload();
  };

  if (pathname?.startsWith('/simulator')) {
    return null;
  }

  return (
    <footer className="bg-paper font-swiss border-ash/40 border-t tracking-[-0.03em]">
      <div className="mx-auto max-w-[1200px] px-6 py-10 lg:px-[48px]">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <Link href="/" className="flex items-center">
              <Image src={DeroLogo} alt="DERO" className="h-5 w-auto" />
            </Link>
            <p className="text-ink/60 text-[13px]">{FOOTER_COPY.tagline}</p>
          </div>

          <nav aria-label="Footer 메뉴" className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_COPY.navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-ink/60 hover:text-ink text-[13px] transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="border-ash/40 mt-8 flex flex-col gap-2 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-ink/40 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
            {FOOTER_COPY.legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-ink transition-colors">
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={handleOpenCookieSettings}
              className="hover:text-ink cursor-pointer transition-colors"
            >
              {FOOTER_COPY.cookieSettingsLabel}
            </button>
          </div>
          <div className="text-ink/40 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
            <span>{FOOTER_COPY.companyName}</span>
            <span>{FOOTER_COPY.copyright}</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
