'use client';
// 조명 GLB 판정 — light_origin 노드를 읽어 product_emitter.point_*_mm를 자동으로 채우고,
// lampShade 차단각 게이트 경고를 띄운다. 경고는 등록을 막지 않는다(228 결정 ③ — 얕은 접시형
// 갓·오픈 셰이드는 실물에 있고 그런 제품은 무늬가 없는 것이 사실이다).
//
// 로더는 /dev/light의 lightPreview다 — KTX2를 붙이므로 텍스처가 박힌 조명 GLB가 열린다.
// (/dev/rig의 rigPreview로 열면 통째로 실패한다.)

import { useEffect } from 'react';

import LightCanvas from '@/components/dev/light/LightCanvas';
import LightShadePanel from '@/components/dev/light/LightShadePanel';
import InlineNotice from '@/components/common/InlineNotice';
import { LIGHT_ORIGIN_NODE_NAME, type PointMm } from '@/three/core/lightAuthoring';
import { useLightAuthorStore, type Distribution } from '@/store/lightAuthorStore';
import type { EmitterDistribution } from '@/types/admin/asset';

/** 와이어 열거 → 빔 반각 프리셋 키. 실제 각의 정본은 `three/scene/lighting.ts`다. */
const BEAM_PRESET: Record<EmitterDistribution, Distribution> = {
  SPOT: 'spot',
  FLOOD: 'flood',
  AMBIENT: 'ambient',
};

const FIELDS: { key: keyof PointMm; axis: string }[] = [
  { key: 'point_x_mm', axis: 'X' },
  { key: 'point_y_mm', axis: 'Y' },
  { key: 'point_z_mm', axis: 'Z' },
];

type Props = {
  glbUrl: string;
  sourceLabel: string;
  /** 발광 초안의 배광. 갓 차단각을 어느 빔 반각과 견줄지 정한다. */
  distribution: EmitterDistribution | '';
  onApplyPoint: (point: PointMm) => void;
};

const AssetLightProbe = ({ glbUrl, sourceLabel, distribution, onApplyPoint }: Props) => {
  const analysis = useLightAuthorStore((s) => s.analysis);
  const loadError = useLightAuthorStore((s) => s.loadError);
  const openAssetSource = useLightAuthorStore((s) => s.openAssetSource);
  const closeAssetSource = useLightAuthorStore((s) => s.closeAssetSource);
  const setDistribution = useLightAuthorStore((s) => s.setDistribution);

  useEffect(() => {
    void openAssetSource(glbUrl, sourceLabel);
    // 소스를 놓지 않으면 다음 /dev/light 방문이 이 관리자 GLB를 연다(store가 모듈 싱글턴이다).
    return () => {
      closeAssetSource();
    };
  }, [glbUrl, sourceLabel, openAssetSource, closeAssetSource]);

  useEffect(() => {
    if (distribution === '') return;
    setDistribution(BEAM_PRESET[distribution]);
  }, [distribution, setDistribution]);

  const point = analysis?.pointMm ?? null;
  const originM = analysis?.originM ?? null;

  return (
    <div className="mt-4">
      <div className="border-ash/20 flex h-[420px] min-h-0 rounded-[10px] border text-neutral-800">
        <div className="min-w-0 flex-1">
          <LightCanvas />
        </div>
        <aside className="flex w-96 shrink-0 flex-col overflow-hidden border-l border-neutral-300 bg-white">
          <section className="border-b border-neutral-300 p-3">
            <div className="mb-2 flex items-center gap-2">
              <h4 className="text-xs font-semibold">
                <code>{LIGHT_ORIGIN_NODE_NAME}</code> 좌표
              </h4>
              <button
                type="button"
                disabled={!point}
                onClick={() => {
                  if (point) onApplyPoint(point);
                }}
                className="bg-highlight text-ink hover:bg-primary-300 ml-auto cursor-pointer rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-default disabled:opacity-40"
              >
                발광 좌표에 채우기
              </button>
            </div>

            {!analysis ? <p className="text-[11px] text-neutral-500">GLB 로드 중…</p> : null}

            {analysis && !point ? (
              <p className="text-[11px] text-neutral-500">
                <code>{LIGHT_ORIGIN_NODE_NAME}</code> 노드가 없습니다 — 아래 경고를 보세요.
              </p>
            ) : null}

            {point ? (
              <table className="w-full text-[11px]">
                <tbody>
                  {FIELDS.map(({ key, axis }, index) => (
                    <tr key={key}>
                      <td className="py-0.5 text-neutral-500">{axis}</td>
                      <td className="py-0.5">
                        <code>{key}</code>
                      </td>
                      <td className="py-0.5 text-right tabular-nums">{point[key]}</td>
                      <td className="py-0.5 text-right text-neutral-400 tabular-nums">
                        {/* 반올림 전 미터 값 — mm 정수를 눈으로 검산하는 자리다. */}
                        {originM ? [originM.x, originM.y, originM.z][index].toFixed(5) : ''} m
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>

          <LightShadePanel />
        </aside>
      </div>

      {loadError !== null ? (
        <div className="mt-3">
          <InlineNotice variant="error" title="GLB를 열지 못했습니다" message={loadError} />
        </div>
      ) : null}
    </div>
  );
};

export default AssetLightProbe;
