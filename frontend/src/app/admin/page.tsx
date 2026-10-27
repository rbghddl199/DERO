// 관리자 콘솔 대시보드 — 각 관리 화면으로 가는 링크만 모아 둔 진입점(운영진 전용).

import type { Metadata } from 'next';
import Link from 'next/link';

import { ADMIN_NAV_ITEMS } from '@/constants/admin/navigation';

export const metadata: Metadata = {
  title: '관리자 콘솔 — 데스크테리어 시뮬레이터',
  description: '카탈로그 제품·3D 에셋 검수·마스터 데이터를 관리합니다',
  robots: { index: false, follow: false },
};

const AdminPage = () => (
  <div>
    <h1 className="text-ink text-[28px] font-bold">관리자 콘솔</h1>
    <p className="text-ash mt-2 text-[15px]">
      관리할 항목을 고르세요. 규격은 모두 실측 mm 정수이며, 카탈로그에 반영되기 전에 3D 에셋 검수를
      거칩니다.
    </p>

    <ul className="mt-8 grid grid-cols-2 gap-4">
      {ADMIN_NAV_ITEMS.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className="border-ash/20 hover:border-ash/40 block h-full rounded-2xl border p-5 transition-colors"
          >
            <span className="text-ink block text-[17px] font-semibold">{item.label}</span>
            <span className="text-ash mt-1 block text-[13px]">{item.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

export default AdminPage;
