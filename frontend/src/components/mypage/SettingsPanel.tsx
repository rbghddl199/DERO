// 마이페이지 설정 하위 메뉴와 Backend 계약이 없는 임시 설정 화면을 메모리 상태로 제공한다.

'use client';

import { useState } from 'react';

export const SETTINGS_SECTIONS = ['계정 설정', '알림 설정', '보안 설정', '기타 설정'] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

type SettingsSectionContentProps = {
  section: SettingsSection;
  onWithdrawClick?: () => void;
};

export const SettingsSectionContent = ({
  section,
  onWithdrawClick,
}: SettingsSectionContentProps) => {
  if (section === '계정 설정') {
    return (
      <section aria-labelledby="account-settings-title" className="max-w-full min-w-0">
        <h2
          id="account-settings-title"
          className="max-w-full text-xl font-bold break-words text-neutral-900"
        >
          회원 탈퇴
        </h2>
        <p className="mt-3 mb-3 max-w-full text-[15px] leading-6 break-words text-neutral-600">
          모든 데이터가 삭제되며 복구할 수 없습니다.
        </p>
        <button
          type="button"
          onClick={onWithdrawClick}
          className="max-w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold break-words whitespace-normal text-white transition-colors hover:bg-red-700"
        >
          회원 탈퇴
        </button>
      </section>
    );
  }

  if (section === '알림 설정') {
    return (
      <section aria-labelledby="notification-settings-title" className="max-w-full min-w-0">
        <h2
          id="notification-settings-title"
          className="max-w-full text-xl font-bold break-words text-neutral-900"
        >
          알림 설정
        </h2>
        <p className="mt-3 max-w-full text-[15px] leading-6 break-words text-neutral-600">
          알림 설정은 준비 중입니다.
        </p>
      </section>
    );
  }

  if (section === '보안 설정') {
    return (
      <section aria-labelledby="security-settings-title" className="max-w-full min-w-0">
        <h2
          id="security-settings-title"
          className="max-w-full text-xl font-bold break-words text-neutral-900"
        >
          보안 설정
        </h2>
        <p className="mt-3 max-w-full text-[15px] leading-6 break-words text-neutral-600">
          소셜 로그인 계정의 비밀번호와 보안 설정은 연결된 소셜 로그인 제공자에서 관리해 주세요.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="other-settings-title" className="max-w-full min-w-0">
      <h2
        id="other-settings-title"
        className="max-w-full text-xl font-bold break-words text-neutral-900"
      >
        기타 설정
      </h2>
      <p className="mt-3 max-w-full text-[15px] leading-6 break-words text-neutral-600">
        기타 설정은 준비 중입니다.
      </p>
    </section>
  );
};

type SettingsPanelProps = {
  onWithdrawClick: () => void;
};

const SettingsPanel = ({ onWithdrawClick }: SettingsPanelProps) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('계정 설정');

  return (
    <section aria-labelledby="settings-panel-title" className="max-w-full min-w-0">
      <div className="max-w-full min-w-0 border-b border-neutral-200 pb-5">
        <p className="text-primary-700 mb-2 max-w-full min-w-0 text-sm font-semibold tracking-[0.14em] break-all">
          SETTINGS
        </p>
        <h1
          id="settings-panel-title"
          className="max-w-full text-[34px] font-bold tracking-[-0.04em] break-words text-neutral-900"
        >
          설정
        </h1>
      </div>

      <div className="flex max-w-full min-w-0 flex-wrap gap-8 pt-7">
        <nav aria-label="설정 하위 메뉴" className="w-44 max-w-full min-w-0 shrink">
          <ul className="w-full max-w-full min-w-0 space-y-1">
            {SETTINGS_SECTIONS.map((section) => {
              const isActive = activeSection === section;

              return (
                <li key={section} className="w-full max-w-full min-w-0">
                  <button
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setActiveSection(section)}
                    className={`w-full max-w-full min-w-0 rounded-xl px-4 py-3 text-left text-sm font-semibold break-words whitespace-normal transition-colors ${
                      isActive
                        ? 'bg-primary-100 text-primary-800'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                    }`}
                  >
                    {section}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="max-w-full min-w-0 flex-1 rounded-2xl border border-neutral-200 bg-neutral-50 p-7">
          <SettingsSectionContent section={activeSection} onWithdrawClick={onWithdrawClick} />
        </div>
      </div>
    </section>
  );
};

export default SettingsPanel;
