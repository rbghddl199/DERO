// 관리자 콘솔 공통 레이아웃 — /admin 하위 모든 화면을 권한 게이트(AdminShell)로 감싼다.

import type { ReactNode } from 'react';

import AdminShell from '@/components/admin/AdminShell';

type Props = {
  children: ReactNode;
};

const AdminLayout = ({ children }: Props) => <AdminShell>{children}</AdminShell>;

export default AdminLayout;
