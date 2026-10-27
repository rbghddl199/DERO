'use client';
// '조작' 팝업 안 관절 패널 — 선택된 관절 에셋(모니터암 등)의 driver 관절 값 슬라이더

import type { CSSProperties } from 'react';
import { useSimulatorStore, type JointPanelState } from '@/store/simulatorStore';

/** 로컬 상태 없이 store(jointPanel)를 단일 소스로 그린다 — 로컬 displayValues를
 *  두면 마운트 후 store.articulate/gizmo 드래그 갱신이 슬라이더에 반영되지
 *  않는다(ADR 결정 5, 코드리뷰 지적). key={itemId}는 아이템이 바뀔 때 리마운트용. */
const JointSliders = ({ panel }: { panel: JointPanelState }) => {
  const articulate = useSimulatorStore((s) => s.articulate);

  return (
    <div className="hud hud-joints" data-testid="hud-joints">
      <div className="hud-title">관절 — {panel.title}</div>
      {panel.joints.map((j) => (
        <label key={j.id} className="joint-row">
          <span className="joint-name" data-testid={`joint-label-${j.id}`}>
            {j.label}
          </span>
          <span className="joint-val tnum">
            {Math.round(j.value)}
            {j.unit}
          </span>
          <input
            type="range"
            className="joint-slider"
            data-testid={`joint-${j.id}`}
            min={j.min}
            max={j.max}
            step={1}
            value={j.value}
            style={{ '--fill': `${((j.value - j.min) / (j.max - j.min)) * 100}%` } as CSSProperties}
            onChange={(e) => {
              articulate(panel.itemId, j.id, Number(e.target.value));
            }}
          />
        </label>
      ))}
    </div>
  );
};

const JointPanel = () => {
  const jointPanel = useSimulatorStore((s) => s.jointPanel);

  if (!jointPanel) {
    return <div className="hud hud-joints hidden" data-testid="hud-joints" />;
  }
  return <JointSliders key={jointPanel.itemId} panel={jointPanel} />;
};

export default JointPanel;
