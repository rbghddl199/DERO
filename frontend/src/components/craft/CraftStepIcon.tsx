// 마법사 스텝 h1 왼쪽 아이콘 — SidebarIcon.tsx(시뮬레이터)와 같은 라인 아이콘 패턴이지만
// 도메인이 달라 craft 폴더에 별도로 둔다.
import type { ReactElement, SVGProps } from 'react';

export type CraftStepIconName = 'desk' | 'budget' | 'title';

const PATHS: Record<CraftStepIconName, ReactElement> = {
  desk: (
    <>
      <rect x="3" y="6" width="18" height="3" rx="1" />
      <path d="M6 9v9M18 9v9" />
    </>
  ),
  budget: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16" cy="14.5" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  title: (
    <>
      <path d="M4 20l0.9-4L16 4.9a1.6 1.6 0 0 1 2.3 0l0.8 0.8a1.6 1.6 0 0 1 0 2.3L8 19.1 4 20Z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),
};

interface CraftStepIconProps extends SVGProps<SVGSVGElement> {
  name: CraftStepIconName;
}

const CraftStepIcon = ({ name, ...props }: CraftStepIconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={32}
    height={32}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {PATHS[name]}
  </svg>
);

export default CraftStepIcon;
