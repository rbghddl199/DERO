'use client';
// 결합 판정 배너(모니터↔암·암↔책상 공통) — 불가(자석 미발동)의 수치 사유와 조건부 경고를
// 화면에 낸다 (D22 3단계).

import { useSimulatorStore } from '@/store/simulatorStore';

const MountBanner = () => {
  const notice = useSimulatorStore((s) => s.mountNotice);

  // 배너는 있을 때만 존재한다 — `.hidden` 규칙을 따로 정의하지 않아도 되고,
  // 사유가 없는 빈 배너가 잠깐 비치는 일도 없다.
  if (!notice) return null;

  return (
    <div
      className={`mount-banner mount-banner--${notice.tone}`}
      data-testid="mount-banner"
      role="status"
    >
      <span className="mount-banner-title">{notice.title}</span>
      <ul className="mount-banner-reasons">
        {notice.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
};

export default MountBanner;
