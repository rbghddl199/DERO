'use client';
// 벽 3면(좌/전면/우)을 디귿(ㄷ)자 평면도로 시각화 — 책상 뒷변이 전면 벽에 붙는 배치를
// 그대로 반영(D18). 각 벽 세그먼트는 토글 상태를 실시간으로 반영하고, 클릭하면 아래
// 스위치와 똑같이 토글된다(REQ-ENV-04). 장식용 다이어그램이라 실제 조작 수단인 스위치
// 쪽에 접근성을 맡기고 이쪽은 aria-hidden.

import type { WallSide } from '@/three/scene/scene';

type Props = {
  wallState: Record<WallSide, boolean>;
  onToggle: (side: WallSide) => void;
};

const WallDiagram = ({ wallState, onToggle }: Props) => (
  <svg viewBox="0 0 160 108" className="wall-diagram" data-testid="wall-diagram" aria-hidden="true">
    <rect x="50" y="22" width="60" height="14" rx="2" className="wall-diagram-desk" />

    <line
      x1="24"
      y1="18"
      x2="136"
      y2="18"
      className={`wall-diagram-seg${wallState.front ? 'on' : ''}`}
      data-testid="wall-diagram-front"
      onClick={() => onToggle('front')}
    />
    <line
      x1="24"
      y1="18"
      x2="24"
      y2="96"
      className={`wall-diagram-seg${wallState.left ? 'on' : ''}`}
      data-testid="wall-diagram-left"
      onClick={() => onToggle('left')}
    />
    <line
      x1="136"
      y1="18"
      x2="136"
      y2="96"
      className={`wall-diagram-seg${wallState.right ? 'on' : ''}`}
      data-testid="wall-diagram-right"
      onClick={() => onToggle('right')}
    />
  </svg>
);

export default WallDiagram;
