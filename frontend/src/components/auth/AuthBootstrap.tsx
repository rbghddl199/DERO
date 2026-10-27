// Root Layout에서 canonical Auth 상태를 한 번 bootstrap하고 loading 상태를 보존한다.

'use client';

import { useEffect } from 'react';

import { authRuntime } from '@/components/auth/authRuntime';

const AuthBootstrap = () => {
  useEffect(() => {
    void authRuntime.bootstrapRoot();
  }, []);

  return null;
};

export default AuthBootstrap;
