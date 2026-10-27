// 시뮬레이터 라우트 — 로그인 관문(D14: 시뮬레이터 진입부터 로그인 필수)을 통과해야 DynamicSimulator를 렌더링한다
import AuthGate from '@/components/auth/AuthGate';
import DynamicSimulator from '@/components/simulator/DynamicSimulator';

const SimulatorPage = () => {
  return (
    <AuthGate
      checkingDescription="시뮬레이터에 들어가기 전에 인증 상태를 확인하고 있습니다."
      anonymousDescription="시뮬레이터는 로그인 후 이용할 수 있습니다. 로그인 화면으로 이동합니다."
    >
      <DynamicSimulator />
    </AuthGate>
  );
};

export default SimulatorPage;
