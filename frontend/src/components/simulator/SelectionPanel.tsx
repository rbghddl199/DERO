'use client';
// 선택 아이템 조작 패널 — 발광 on/off + 발광 색 + 램프 밝기·색온도 + 결합 분리.
// 회전·기울기 정밀값과 복제·삭제·선택 해제는 같은 패널의 SelectedItemControls.tsx가
// 담당한다(2026-08-03 부동 SelectionToolbar 폐기, ADR-0022 결정 8).

import type { CSSProperties } from 'react';
import RemoteImage from '@/components/common/RemoteImage';
import { useSimulatorStore, type LampPanelState } from '@/store/simulatorStore';
import { getProduct } from '@/three/scene/product';
import LightSwitch from './LightSwitch';
import {
  BRIGHTNESS_SCALE_MIN,
  BRIGHTNESS_SCALE_MAX,
  COLOR_TEMP_MIN_K,
  COLOR_TEMP_MAX_K,
  type MarkerSpan,
} from '@/three/scene/lighting';

/** 가변 발광 프리셋 — ADR-0003 네온 무드 레퍼런스의 대표 색(인디고·시안·바이올렛·
 *  마젠타 + 웜화이트). 판정 시맨틱 3색(그린·앰버·레드, DESIGN-SYSTEM §1.4)은 뺐다 —
 *  같은 화면에서 적합/조건부/불가로 읽힌다. 자유 선택은 옆의 네이티브 컬러 피커. */
const EMITTER_PRESETS = ['#6060e0', '#22d3ee', '#a855f7', '#ff3fa4', '#fff1d6'];

/** 제품 카드 썸네일과 같은 규칙(LibraryPanel·EstimatePanel) — 실 카탈로그는 대표 실사
 *  이미지, 없으면(mock 카탈로그) 빌드타임 정적 PNG (DERO-325). */
const thumbnailUrl = (specId: string): string =>
  getProduct(specId)?.imageUrl ?? `/assets/thumbnails/${specId}.png`;
const formatKrw = (n: number): string => `${n.toLocaleString('ko-KR')}원`;

/** 조절 범위 [lo,hi] 위에서 값이 놓이는 비율(%). `.joint-slider`는 자기 min/max를
 *  모르므로 `--fill` 계산은 호출부 책임이다(frontend/CLAUDE.md 슬라이더 함정). */
const pctOf = (value: number, lo: number, hi: number): number => ((value - lo) / (hi - lo)) * 100;

/** 고정형 판정 — 조절 불가 제품은 사양 min·max가 같은 값이다(백엔드 `Light` 규약).
 *  **인자는 반드시 저작 사양(`*Spec`)이지 클램프된 마커가 아니다** — 마커로 판정하면
 *  조절 범위 밖 범위형이 한 점으로 뭉개져 "고정형"으로 거짓 표시된다. */
const isFixedSpec = (spec: MarkerSpan): boolean => spec.min === spec.max;

/** 슬라이더 헤더의 사양 캡션 — **현재값이 아니라 제품 사양 표기다**. 세 상태로 갈린다:
 *  범위형 `제품 사양 3000~5700K` · 고정형 `제품 사양 2700K 고정형` · 미제공 `제품 사양 미제공`.
 *  **클램프 안 된 저작 사양을 읽는다** — 이 줄은 "제품이 어떤 물건인가"를 말하는 자리라
 *  슬라이더 하한과 무관하게 참이어야 한다(밝기 축은 그래서 배율이 아니라 원본 lm이다). */
const specCaption = (
  spec: MarkerSpan | null,
  toNumber: (v: number) => number,
  unit: string,
): string => {
  if (!spec) return '제품 사양 미제공';
  if (isFixedSpec(spec)) return `제품 사양 ${toNumber(spec.max)}${unit} 고정형`;
  return `제품 사양 ${toNumber(spec.min)}~${toNumber(spec.max)}${unit}`;
};

/** 사양 마커 — 조절 축 위에 **투영된** 자리를 얹는다. 캡션과 숫자가 어긋날 수 있고 그건
 *  사실이다(제품은 200lm까지 내려가도 조절 하한이 280lm이면 띠는 거기서 시작한다).
 *  모양은 둘: **고정형**은 점 하나, 그 외는 띠. 고정형을 폭 0짜리 띠로 그리면 화면에서
 *  아예 안 보인다 — 그게 287 1차 판정("UI가 깨진 느낌")의 증상이었다.
 *  **`isFixed`는 호출부가 저작 사양으로 판정해서 넘긴다** — 여기서 `span`으로 다시 판정하면
 *  클램프에 뭉개진 범위형이 거짓 고정형이 된다.
 *  `span`이 null일 때(사양 미제공 또는 조절 범위 밖)만 오버레이를 안 그린다(REQ-SIM-08). */
const MarkerBand = ({
  span,
  isFixed,
  lo,
  hi,
  title,
}: {
  span: MarkerSpan | null;
  isFixed: boolean;
  lo: number;
  hi: number;
  title?: string;
}) => {
  if (!span) return null;
  const left = pctOf(span.min, lo, hi);
  if (isFixed) {
    return (
      <span
        className="lamp-marker-point"
        aria-hidden="true"
        title={title}
        style={{ '--marker-left': `${left}%` } as CSSProperties}
      />
    );
  }
  return (
    <span
      className="lamp-marker"
      aria-hidden="true"
      title={title}
      style={
        {
          '--marker-left': `${left}%`,
          '--marker-width': `${pctOf(span.max, lo, hi) - left}%`,
        } as CSSProperties
      }
    />
  );
};

/** 램프 밝기 배율·색온도 조절 (REQ-SIM-08, DERO-287). 마커 밖으로도 조절된다 —
 *  마커는 표시일 뿐 슬라이더 범위를 자르지 않는다. 조도(룩스)는 표시하지 않는다. */
const LampControls = ({ panel }: { panel: LampPanelState }) => {
  const setLampBrightness = useSimulatorStore((s) => s.setLampBrightness);
  const setLampColorTemp = useSimulatorStore((s) => s.setLampColorTemp);

  // 캡션·툴팁·마커 모양은 전부 **저작 사양**(`*Spec`)으로 판정한다. 마커의 **자리**만
  // 클램프된 `*Marker`를 쓴다 — 두 값이 갈리는 것이 이 UI의 설계다.
  const brightnessCaption = specCaption(panel.brightnessSpec, Math.round, 'lm');
  const colorTempCaption = specCaption(panel.colorTempSpec, Math.round, 'K');
  const isBrightnessFixed = panel.brightnessSpec !== null && isFixedSpec(panel.brightnessSpec);
  const isColorTempFixed = panel.colorTempSpec !== null && isFixedSpec(panel.colorTempSpec);

  return (
    <>
      <div className="lamp-row">
        <div className="lamp-row-head">
          <span className="lamp-label">밝기</span>
          <span className="lamp-val tnum">
            ×{panel.brightnessScale.toFixed(1)} · {Math.round(panel.effectiveLumens)}lm
          </span>
        </div>
        <div className="lamp-spec tnum" data-testid="lamp-brightness-spec">
          {brightnessCaption}
        </div>
        <div className="lamp-slider-wrap">
          <MarkerBand
            span={panel.brightnessMarker}
            isFixed={isBrightnessFixed}
            lo={BRIGHTNESS_SCALE_MIN}
            hi={BRIGHTNESS_SCALE_MAX}
            title={brightnessCaption}
          />
          <input
            type="range"
            className="joint-slider"
            data-testid="lamp-brightness"
            aria-label="램프 밝기 배율"
            min={BRIGHTNESS_SCALE_MIN}
            max={BRIGHTNESS_SCALE_MAX}
            step={0.05}
            value={panel.brightnessScale}
            style={
              {
                '--fill': `${pctOf(panel.brightnessScale, BRIGHTNESS_SCALE_MIN, BRIGHTNESS_SCALE_MAX)}%`,
              } as CSSProperties
            }
            onChange={(e) => setLampBrightness(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="lamp-row">
        <div className="lamp-row-head">
          <span className="lamp-label">색온도</span>
          <span className="lamp-val tnum">{Math.round(panel.colorTempK)}K</span>
        </div>
        <div className="lamp-spec tnum" data-testid="lamp-colortemp-spec">
          {colorTempCaption}
        </div>
        <div className="lamp-slider-wrap">
          <MarkerBand
            span={panel.colorTempMarker}
            isFixed={isColorTempFixed}
            lo={COLOR_TEMP_MIN_K}
            hi={COLOR_TEMP_MAX_K}
            title={colorTempCaption}
          />
          <input
            type="range"
            className="joint-slider"
            data-testid="lamp-colortemp"
            aria-label="램프 색온도"
            min={COLOR_TEMP_MIN_K}
            max={COLOR_TEMP_MAX_K}
            step={100}
            value={panel.colorTempK}
            style={
              {
                '--fill': `${pctOf(panel.colorTempK, COLOR_TEMP_MIN_K, COLOR_TEMP_MAX_K)}%`,
              } as CSSProperties
            }
            onChange={(e) => setLampColorTemp(Number(e.target.value))}
          />
        </div>
      </div>
    </>
  );
};

const SelectionPanel = () => {
  const sim = useSimulatorStore((s) => s.sim);
  const selectedItemId = useSimulatorStore((s) => s.selectedItemId);
  const selectedItemName = useSimulatorStore((s) => s.selectedItemName);
  const selectedItemSpecId = useSimulatorStore((s) => s.selectedItemSpecId);
  const emitterPanel = useSimulatorStore((s) => s.emitterPanel);
  const lampPanel = useSimulatorStore((s) => s.lampPanel);
  const screenPanel = useSimulatorStore((s) => s.screenPanel);
  const setScreenPhotoSelected = useSimulatorStore((s) => s.setScreenPhotoSelected);
  const recolorSelected = useSimulatorStore((s) => s.recolorSelected);
  const toggleEmitterSelected = useSimulatorStore((s) => s.toggleEmitterSelected);
  const mountArmName = useSimulatorStore((s) => s.selectedMountArmName);
  // 스토어의 참조를 그대로 받고 아래 본문에서 꺼낸다 — 셀렉터에서 파생하면 무한 리렌더.
  const mountJudgments = useSimulatorStore((s) => s.mountJudgments);
  const detachSelected = useSimulatorStore((s) => s.detachSelected);

  if (!selectedItemId) {
    return <div className="hud hud-selection hidden" data-testid="hud-selection" />;
  }

  // 셀렉터에서 파생값을 만들면 스냅샷마다 새 참조라 무한 리렌더다 — 저장된 참조를
  // 그대로 받아 여기서 가공한다(frontend/CLAUDE.md zustand v5 함정).
  // 고정 발광(recolorable:false)은 색이 제품 정체성이라 색 컨트롤 자체를 그리지 않는다.
  // on/off 스위치는 그와 무관하게 발광체가 있으면 항상 그린다(끄기는 보기 설정이다).
  const emitterColor = emitterPanel?.recolorable ? emitterPanel.color.toLowerCase() : null;
  // 결합 판정은 결합이 유지되는 동안 계속 보여준다 (배너는 몇 초 뒤 사라진다).
  const mountJudgment = mountJudgments[selectedItemId];
  const isConditional = mountJudgment?.result === 'CONDITIONAL';
  const selectedSpec = sim?.placed().find((i) => i.id === selectedItemId)?.spec ?? null;

  return (
    <div className="hud hud-selection" data-testid="hud-selection">
      <div className="sel-header">
        {selectedItemSpecId && (
          <RemoteImage
            className="sel-thumb"
            src={thumbnailUrl(selectedItemSpecId)}
            alt={selectedItemName ?? ''}
            width={72}
            height={72}
            data-testid="sel-thumb"
          />
        )}
        <div className="sel-info">
          <div className="sel-product-name">{selectedItemName}</div>
          {selectedSpec?.brand && <div className="sel-brand">{selectedSpec.brand}</div>}
          {selectedSpec?.priceKrw !== undefined && (
            <div className="sel-price tnum">{formatKrw(selectedSpec.priceKrw)}</div>
          )}
          {selectedSpec && (
            <div className="sel-dims">
              <div className="sel-dim-row">
                <span className="sel-dim-label">너비</span>
                <span className="sel-dim-value tnum">{Math.round(selectedSpec.widthMm)}mm</span>
              </div>
              <div className="sel-dim-row">
                <span className="sel-dim-label">깊이</span>
                <span className="sel-dim-value tnum">{Math.round(selectedSpec.depthMm)}mm</span>
              </div>
              <div className="sel-dim-row">
                <span className="sel-dim-label">높이</span>
                <span className="sel-dim-value tnum">{Math.round(selectedSpec.heightMm)}mm</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {mountArmName && (
        <div className="sel-mount" data-testid="mount-status">
          <div className="sel-mount-arm">
            <span className="sel-mount-name">결합 — {mountArmName}</span>
            {isConditional && (
              <span className="badge-warn" data-testid="mount-conditional">
                조건부
              </span>
            )}
          </div>
          {isConditional && (
            <ul className="sel-mount-reasons">
              {mountJudgment.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="chip"
            data-testid="detach-button"
            onClick={() => detachSelected()}
          >
            분리
          </button>
        </div>
      )}

      {emitterPanel && (
        <LightSwitch
          label="발광"
          checked={emitterPanel.on}
          onToggle={() => toggleEmitterSelected(!emitterPanel.on)}
          testId="emitter-on"
        />
      )}

      {emitterColor !== null && emitterPanel?.on && (
        <div className="emit-row" data-testid="emitter-row">
          <span className="emit-label">발광 색</span>
          {EMITTER_PRESETS.map((hex) => (
            <button
              key={hex}
              type="button"
              className={hex === emitterColor ? 'emit-swatch active' : 'emit-swatch'}
              style={{ background: hex }}
              data-testid={`emitter-preset-${hex.slice(1)}`}
              aria-label={`발광 색 ${hex}`}
              aria-pressed={hex === emitterColor}
              onClick={() => recolorSelected(hex)}
            />
          ))}
          <input
            type="color"
            className="emit-picker"
            data-testid="emitter-color"
            aria-label="발광 색 직접 선택"
            value={emitterColor}
            onChange={(e) => recolorSelected(e.target.value)}
          />
        </div>
      )}

      {screenPanel && (
        <div className="screen-row" data-testid="screen-photo-row">
          <span className="emit-label">화면 사진</span>
          <label className="chip screen-pick">
            {screenPanel.hasPhoto ? '변경' : '사진 올리기'}
            <input
              type="file"
              accept="image/*"
              data-testid="screen-photo-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // 같은 파일을 다시 골라도 change가 나게 값을 비운다.
                e.target.value = '';
                if (file) void setScreenPhotoSelected(file);
              }}
            />
          </label>
          {screenPanel.hasPhoto && (
            <button
              type="button"
              className="chip"
              data-testid="screen-photo-clear"
              onClick={() => void setScreenPhotoSelected(null)}
            >
              제거
            </button>
          )}
        </div>
      )}

      {lampPanel && <LampControls panel={lampPanel} />}
    </div>
  );
};

export default SelectionPanel;
