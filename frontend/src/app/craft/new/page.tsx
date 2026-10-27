// 새 데스크테리어 시작 라우트 — 책상 선택→예산 입력→이름 작성 3단계 마법사를 /simulator 진입 전에 받는다
import type { Metadata } from 'next';
import Link from 'next/link';
import AuthGate from '@/components/auth/AuthGate';
import HideScrollbar from '@/components/common/HideScrollbar';
import CraftNewWizard from '@/components/craft/CraftNewWizard';

export const metadata: Metadata = {
  title: '새 데스크테리어 만들기 — 데스크테리어 시뮬레이터',
  description: '책상 선택·예산 입력·제목 작성 3단계로 새 데스크테리어를 시작하세요',
};

const CraftNewPage = () => {
  return (
    <div className="bg-paper min-h-full">
      <HideScrollbar />
      <div className="mx-auto max-w-[1200px] px-6 pt-12 pb-24 lg:px-[48px]">
        <div className="flex items-center gap-4">
          <Link href="/craft" className="text-ash hover:text-ink text-[14px]">
            내 데스크테리어로 돌아가기
          </Link>
        </div>

        <div className="mt-6">
          <AuthGate
            checkingDescription="새 데스크테리어를 만들기 전에 인증 상태를 확인하고 있습니다."
            anonymousDescription="새 데스크테리어 만들기는 로그인 후 이용할 수 있습니다. 로그인 화면으로 이동합니다."
          >
            <CraftNewWizard />
          </AuthGate>
        </div>
      </div>
    </div>
  );
};

export default CraftNewPage;
