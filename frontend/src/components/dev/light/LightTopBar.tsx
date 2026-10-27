'use client';
// 조명 등록 도구 상단 바 — 리포 GLB 드롭다운 · 로컬 파일 열기 · 빔 반각 프리셋 · 갓 하이라이트 토글

import { beamHalfAngleRad } from '@/three/scene/lighting';
import {
  DISTRIBUTIONS,
  LIGHT_SOURCES,
  useLightAuthorStore,
  type Distribution,
} from '@/store/lightAuthorStore';

/** 카탈로그 표기(GLOSSARY 배광 3종)와 같은 이름을 쓴다. */
const DISTRIBUTION_LABEL: Record<Distribution, string> = {
  spot: '집중형 SPOT',
  flood: '확산형 FLOOD',
  ambient: '주변광 AMBIENT',
};

const beamHalfAngleDeg = (d: Distribution): number => (beamHalfAngleRad(d) * 180) / Math.PI;

const LightTopBar = () => {
  const selectedUrl = useLightAuthorStore((s) => s.selectedUrl);
  const sourceLabel = useLightAuthorStore((s) => s.sourceLabel);
  const selectSource = useLightAuthorStore((s) => s.selectSource);
  const loadFile = useLightAuthorStore((s) => s.loadFile);
  const distribution = useLightAuthorStore((s) => s.distribution);
  const setDistribution = useLightAuthorStore((s) => s.setDistribution);
  const shadeHighlight = useLightAuthorStore((s) => s.shadeHighlight);
  const toggleShadeHighlight = useLightAuthorStore((s) => s.toggleShadeHighlight);

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-neutral-300 bg-neutral-100 px-4 py-2">
      <h1 className="text-sm font-semibold">조명 GLB 등록</h1>

      <label className="flex items-center gap-1 text-xs">
        <span className="text-neutral-600">리포 GLB</span>
        <select
          className="max-w-56 rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
          value={selectedUrl}
          onChange={(e) => {
            void selectSource(e.target.value);
          }}
        >
          {/* 파일을 열면 드롭다운은 어느 항목도 가리키지 않는다 — 빈 값 자리를 남긴다. */}
          {selectedUrl === '' && <option value="">— 로컬 파일 —</option>}
          {LIGHT_SOURCES.map((s) => (
            <option key={s.url} value={s.url}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1 text-xs">
        {/* 조명 GLB는 아직 리포에 0장이다 — 실제 저작물은 여기로 연다. */}
        <span className="text-neutral-600">파일 열기</span>
        <input
          type="file"
          accept=".glb,model/gltf-binary"
          className="w-44 text-[11px]"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadFile(file);
          }}
        />
      </label>

      <label className="flex items-center gap-1 text-xs">
        <span className="text-neutral-600">빔 프리셋</span>
        <select
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
          value={distribution}
          onChange={(e) => setDistribution(e.target.value as Distribution)}
        >
          {DISTRIBUTIONS.map((d) => (
            <option key={d} value={d}>
              {DISTRIBUTION_LABEL[d]} — 반각 {beamHalfAngleDeg(d).toFixed(1)}°
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={shadeHighlight} onChange={toggleShadeHighlight} />
        <span className="text-neutral-600">갓 하이라이트</span>
      </label>

      <span className="ml-auto max-w-64 truncate text-xs text-neutral-500" title={sourceLabel}>
        {sourceLabel}
      </span>
    </header>
  );
};

export default LightTopBar;
