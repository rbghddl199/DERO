// 메인 랜딩 — 컬렉션 배너·컬렉션·제품 미리보기 우선 홈(2026-08-04 개편, 오늘의집 방식).
// 서비스 설명(쇼케이스·소개 5종)은 아래로 내려갔고 히어로 카피·목업은 렌더에서 빠졌다(homeCopy.ts 보존).
import Image from 'next/image';
import Link from 'next/link';
import DeroLogo from '@/assets/dero_logo.svg';
import DesktopShowcase from '@/components/home/DesktopShowcase';
import HomeCtaLink from '@/components/home/HomeCtaLink';
import HomeDeskFeedPreview from '@/components/home/HomeDeskFeedPreview';
import HomeFeedBanner from '@/components/home/HomeFeedBanner';
import HomeFeedPreview from '@/components/home/HomeFeedPreview';
import HomeProductPreview from '@/components/home/HomeProductPreview';
import MonitorArmShowcase from '@/components/home/MonitorArmShowcase';
import ServiceFeatures from '@/components/home/ServiceFeatures';
import SplitText from '@/components/home/SplitText';
import DecorGlowBackground from '@/components/common/DecorGlowBackground';
import ScrollProgress from '@/components/common/ScrollProgress';
import { getCollectionPage } from '@/api/collection';
import { listDeskFeeds } from '@/api/deskFeed';
import { getProductPage } from '@/api/product';
import { isMockApi } from '@/constants/api';
import { libraryItems, type ProductSpec } from '@/three/scene/product';
import { toProductSpec } from '@/three/scene/catalogAdapter';
import type { CollectionPost } from '@/components/collection/types';
import type { DeskFeedSummaryResponse } from '@/types/deskFeed';
import {
  HOME_DESK_FEED_PREVIEW_COPY,
  HOME_FEED_PREVIEW_COPY,
  HOME_PRODUCT_PREVIEW_COPY,
  HOME_DESKTOP_SHOWCASE_COPY,
  HOME_MONITOR_ARM_SHOWCASE_COPY,
  HOME_SERVICE_FEATURES_COPY,
  HOME_CLOSING_CTA_COPY,
} from '@/constants/homeCopy';

/** 랜딩 첫 화면 미리보기용 8개. 실패해도 페이지를 죽이지 않고 빈 배열로 접는다 — 해당 섹션만
 *  조용히 숨는다(컬렉션 "빈 것도 정상" 원칙, collection/CLAUDE.md와 같은 태도). */
const PREVIEW_COUNT = 8;

async function loadHomeFeedPreview(): Promise<CollectionPost[]> {
  try {
    const page = await getCollectionPage('popular', null);
    return page.posts.slice(0, PREVIEW_COUNT);
  } catch (error: unknown) {
    console.error('[Home] 컬렉션 미리보기 조회 실패', error);
    return [];
  }
}

/** 데스크피드(실사 사진) 미리보기 — 컬렉션과 같은 태도로 실패·빈 결과면 섹션째 숨는다
 *  (REQ-COM-14 규칙, ADR-0033 결정 6의 후속). 표지가 없는 글(사진 등록 전)은 홈에 빈 타일이
 *  되므로 걸러낸다. */
async function loadHomeDeskFeedPreview(): Promise<DeskFeedSummaryResponse[]> {
  try {
    const page = await listDeskFeeds({ sort: 'popular', size: PREVIEW_COUNT });
    return page.content.filter((post) => post.coverUrl !== null).slice(0, PREVIEW_COUNT);
  } catch (error: unknown) {
    console.error('[Home] 데스크피드 미리보기 조회 실패', error);
    return [];
  }
}

/** real 모드는 전 카탈로그(prefetchCatalog)가 아니라 커서 첫 페이지만 받는다 — 미리보기 8개에
 *  전체 카탈로그가 필요 없다(/product 페이지와는 다른 계약). 책상(kind:'surface')은 /product와
 *  같은 규칙으로 제외한다. */
async function loadHomeProductPreview(): Promise<ProductSpec[]> {
  if (isMockApi()) return libraryItems().slice(0, PREVIEW_COUNT);
  try {
    const page = await getProductPage({ size: PREVIEW_COUNT + 4 });
    const specs = await Promise.all(page.content.map((dto) => toProductSpec(dto, [])));
    return specs
      .filter((s): s is ProductSpec => s !== null && s.kind !== 'surface')
      .slice(0, PREVIEW_COUNT);
  } catch (error: unknown) {
    console.error('[Home] 제품 미리보기 조회 실패', error);
    return [];
  }
}

export default async function Home() {
  const [feedPosts, deskFeedPosts, previewProducts] = await Promise.all([
    loadHomeFeedPreview(),
    loadHomeDeskFeedPreview(),
    loadHomeProductPreview(),
  ]);

  return (
    <div className="bg-paper relative overflow-hidden">
      <ScrollProgress />
      {/* 간접 조명은 TopNav 바로 아래(= 이 wrapper의 top-0)에서 시작해야 하므로 root 직속으로 둔다.
          컬렉션 배너 섹션 안에 두면 top-0이 그 섹션 기준이 되어 콘테스트 배너 아래에서 빛이
          시작한다(2026-08-09 사용자 보고). 컬렉션 유무와 무관하게 항상 노출. */}
      <DecorGlowBackground />
      {/* 컬렉션 배너 — 인기 컬렉션 자동 캐러셀, 홈 최상단. 컬렉션가 비면(백엔드 없음·실패 포함)
          조용히 생략 */}
      {feedPosts.length > 0 && (
        <section className="relative">
          <div className="relative mx-auto max-w-[1200px] px-6 pt-10 lg:px-12 lg:pt-14">
            <HomeFeedBanner posts={feedPosts.slice(0, 5)} />
          </div>
        </section>
      )}

      {/* 컬렉션 미리보기 */}
      {feedPosts.length > 0 && (
        <section className="mx-auto max-w-[1200px] px-6 pb-24 lg:px-12">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-semibold text-neutral-900 sm:text-[28px]">
                {HOME_FEED_PREVIEW_COPY.title}
              </h2>
              <p className="mt-2 text-[15px] text-neutral-600">{HOME_FEED_PREVIEW_COPY.subtitle}</p>
            </div>
            <Link
              href="/collection"
              className="hover:text-primary-600 shrink-0 text-[14px] font-medium text-neutral-500 transition-colors"
            >
              {HOME_FEED_PREVIEW_COPY.viewAllLabel} →
            </Link>
          </div>
          <HomeFeedPreview posts={feedPosts} />
        </section>
      )}

      {/* 데스크피드 미리보기 — 3D 배치(컬렉션) 다음에 실사 사진. 글이 없으면 섹션째 숨는다 */}
      {deskFeedPosts.length > 0 && (
        <section className="mx-auto max-w-[1200px] px-6 pb-24 lg:px-12">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-semibold text-neutral-900 sm:text-[28px]">
                {HOME_DESK_FEED_PREVIEW_COPY.title}
              </h2>
              <p className="mt-2 text-[15px] text-neutral-600">
                {HOME_DESK_FEED_PREVIEW_COPY.subtitle}
              </p>
            </div>
            <Link
              href="/desk-feed"
              className="hover:text-primary-600 shrink-0 text-[14px] font-medium text-neutral-500 transition-colors"
            >
              {HOME_DESK_FEED_PREVIEW_COPY.viewAllLabel} →
            </Link>
          </div>
          <HomeDeskFeedPreview posts={deskFeedPosts} />
        </section>
      )}

      {/* 인기 제품 미리보기 */}
      {previewProducts.length > 0 && (
        <section className="mx-auto max-w-[1200px] px-6 pb-24 lg:px-12">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-semibold text-neutral-900 sm:text-[28px]">
                {HOME_PRODUCT_PREVIEW_COPY.title}
              </h2>
              <p className="mt-2 text-[15px] text-neutral-600">
                {HOME_PRODUCT_PREVIEW_COPY.subtitle}
              </p>
            </div>
            <Link
              href="/product"
              className="hover:text-primary-600 shrink-0 text-[14px] font-medium text-neutral-500 transition-colors"
            >
              {HOME_PRODUCT_PREVIEW_COPY.viewAllLabel} →
            </Link>
          </div>
          <HomeProductPreview products={previewProducts} />
        </section>
      )}

      {/* 데스크 GLB 쇼케이스 — 예쁘게 저작한 데스크 에셋을 360도 천천히 돌려 보여주는 랜딩 소개 배너 */}
      <section className="mx-auto max-w-[1200px] px-6 pb-24 lg:px-12">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <DesktopShowcase />
          <div>
            <h2 className="text-[24px] font-semibold text-neutral-900 sm:text-[28px]">
              {HOME_DESKTOP_SHOWCASE_COPY.title}
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-[1.6] text-neutral-600">
              {HOME_DESKTOP_SHOWCASE_COPY.description}
            </p>
          </div>
        </div>
      </section>

      {/* 관절 쇼케이스 — 실제 FK 리그로 모니터암이 스스로 움직이는 미니 데모 */}
      <section className="mx-auto max-w-[1200px] px-6 pb-24 lg:px-12">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div className="text-center lg:text-left">
            <h2 className="text-[24px] font-semibold text-neutral-900 sm:text-[28px]">
              {HOME_MONITOR_ARM_SHOWCASE_COPY.title}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-[15px] text-neutral-600 lg:mx-0">
              {HOME_MONITOR_ARM_SHOWCASE_COPY.description}
            </p>
          </div>
          <MonitorArmShowcase />
        </div>
      </section>

      {/* 서비스 소개 배너 5종 — 차별점(D3-4)·무드 조명(D5)·실시간 견적(D9)·커뮤니티·컬렉션, dutymate.net 참고 교차 배치 */}
      <section className="mx-auto max-w-[1200px] px-6 pb-24 lg:px-12">
        <div className="mb-14 text-center">
          <div className="bg-primary-300 mx-auto mb-5 h-px w-12" />
          <h2 className="flex items-center justify-center gap-2 text-[24px] font-semibold text-neutral-900 sm:text-[28px]">
            <Image
              src={DeroLogo}
              alt={HOME_SERVICE_FEATURES_COPY.titleHighlight}
              className="h-6 w-auto sm:h-7"
            />
            {HOME_SERVICE_FEATURES_COPY.titleRest}
          </h2>
        </div>
        <ServiceFeatures />
      </section>

      {/* 클로징 CTA */}
      <section className="mx-auto max-w-[1200px] px-6 pb-24 lg:px-12">
        <div className="from-primary-200 via-primary-100 to-decor-ivory relative overflow-hidden rounded-[24px] px-8 py-14 text-center sm:px-16">
          {/* React Bits ShinyText를 적용했다가 디자인이 마음에 들지 않아 원래 정적 텍스트로
              되돌렸다(2026-07-31 사용자 확인). 이후 문구 자체엔 React Bits SplitText(GSAP
              스크롤 트리거 글자·단어 등장)만 적용(2026-07-31). */}
          <h2 className="text-[24px] font-semibold text-neutral-900 sm:text-[28px]">
            <SplitText text={HOME_CLOSING_CTA_COPY.title} splitType="chars" />
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-neutral-800">
            <SplitText text={HOME_CLOSING_CTA_COPY.description} splitType="words" delay={20} />
          </p>
          {/* 비로그인이면 '로그인하고 시작하기'로 /login?returnTo=/craft, 로그인 상태면
              '데스크 꾸미러 가기'로 /craft(내 데스크테리어 목록) 바로 이동(2026-07-31 사용자 확인 —
              목적지가 /craft/new에서 /craft로 바뀌었다). */}
          <HomeCtaLink />
        </div>
      </section>
    </div>
  );
}
