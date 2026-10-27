// 카메라 시점 칩용 라인 아이콘 — 데스크(사각형) 기준 카메라 위치·방향을 스키매틱하게 표현
import type { ReactElement, SVGProps } from 'react';
import type { PresetName } from '@/three/render/camera';

const DESK_RECT = <rect x="7" y="7" width="10" height="10" rx="1.5" />;

const PATHS: Record<PresetName, ReactElement> = {
  hero: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M12 3v9M4 7.5l8 4.5 8-4.5" />
    </>
  ),
  'first-person': (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  front: (
    <>
      {DESK_RECT}
      <path d="M9.5 21L14.5 21L12 17.5Z" />
    </>
  ),
  back: (
    <>
      {DESK_RECT}
      <path d="M9.5 3L14.5 3L12 6.5Z" />
    </>
  ),
  side: (
    <>
      {DESK_RECT}
      <path d="M3 9.5L3 14.5L6.5 12Z" />
    </>
  ),
  top: (
    <>
      {DESK_RECT}
      <path d="M12 9v6M9 12h6" />
    </>
  ),
};

interface CameraPresetIconProps extends SVGProps<SVGSVGElement> {
  name: PresetName;
}

const CameraPresetIcon = ({ name, ...props }: CameraPresetIconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={16}
    height={16}
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

export default CameraPresetIcon;
