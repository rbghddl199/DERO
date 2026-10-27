// 크래프트 라우트 — 내 데스크테리어 목록 + 새로 만들기 진입점
//
// 이 페이지는 metadata와 껍데기만 담당한다. 목록 조회는 CraftDeskCollectionLoader가 브라우저에서
// 한다 — 액세스 토큰이 브라우저 메모리에만 살아서(ADR-0005 결정 3) Node에서 getDeskProjects()를
// 부르면 익명 요청이 되고, 선택적 인증이 걸린 GET /placements가 남의 PUBLIC 배치만 돌려준다.
import type { Metadata } from 'next';
import AuthGate from '@/components/auth/AuthGate';
import HideScrollbar from '@/components/common/HideScrollbar';
import CraftDeskCollectionLoader from '@/components/craft/CraftDeskCollectionLoader';
import CraftPageHeader from '@/components/craft/CraftPageHeader';

export const metadata: Metadata = {
  title: '내 데스크테리어 — 데스크테리어 시뮬레이터',
  description: '지금까지 만든 데스크테리어를 확인하고 이어서 편집하세요',
};

const CraftPage = () => {
  return (
    <div className="bg-paper min-h-full">
      <HideScrollbar />
      <div className="mx-auto max-w-[1200px] px-6 pt-12 pb-24 lg:px-[48px]">
        <AuthGate
          checkingDescription="내 데스크테리어를 열기 전에 인증 상태를 확인하고 있습니다."
          anonymousDescription="내 데스크테리어는 로그인 후 볼 수 있습니다. 로그인 화면으로 이동합니다."
        >
          <CraftPageHeader />

          <div className="mt-6">
            <CraftDeskCollectionLoader />
          </div>
        </AuthGate>
      </div>
    </div>
  );
};

export default CraftPage;
