'use client';
// 조명 등록 도구 우 패널 상단 — light_origin 노드 좌표를 product_emitter.point_*_mm 정수로 보여주고 복사시킨다

import { LIGHT_ORIGIN_NODE_NAME, type PointMm } from '@/three/core/lightAuthoring';
import { useLightAuthorStore } from '@/store/lightAuthorStore';

const FIELDS: { key: keyof PointMm; axis: string }[] = [
  { key: 'point_x_mm', axis: 'X' },
  { key: 'point_y_mm', axis: 'Y' },
  { key: 'point_z_mm', axis: 'Z' },
];

const LightOriginPanel = () => {
  const analysis = useLightAuthorStore((s) => s.analysis);
  const copyPointJson = useLightAuthorStore((s) => s.copyPointJson);
  const copyPointField = useLightAuthorStore((s) => s.copyPointField);

  const point = analysis?.pointMm ?? null;
  const originM = analysis?.originM ?? null;

  return (
    <section className="border-b border-neutral-300 p-3">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-xs font-semibold">
          <code>{LIGHT_ORIGIN_NODE_NAME}</code> → <code>product_emitter</code>
        </h2>
        <button
          type="button"
          disabled={!point}
          onClick={() => void copyPointJson()}
          className="ml-auto cursor-pointer rounded bg-neutral-200 px-2 py-1 text-[11px] disabled:cursor-default disabled:opacity-40"
        >
          JSON 복사
        </button>
      </div>

      {!analysis && <p className="text-[11px] text-neutral-500">GLB를 로드하세요</p>}

      {analysis && !point && (
        <p className="text-[11px] text-neutral-500">
          <code>{LIGHT_ORIGIN_NODE_NAME}</code> 노드가 없습니다 — 아래 경고를 보세요
        </p>
      )}

      {point && (
        <table className="w-full text-[11px]">
          <tbody>
            {FIELDS.map(({ key, axis }, i) => (
              <tr key={key}>
                <td className="py-0.5 text-neutral-500">{axis}</td>
                <td className="py-0.5">
                  <code>{key}</code>
                </td>
                <td className="py-0.5 text-right font-mono">{point[key]}</td>
                <td className="py-0.5 text-right font-mono text-neutral-400">
                  {/* 제품 로컬 원본(미터) — 반올림 전 값을 같이 보여줘야 mm 정수를 검산할 수 있다. */}
                  {originM ? [originM.x, originM.y, originM.z][i].toFixed(5) : ''} m
                </td>
                <td className="py-0.5 pl-1 text-right">
                  <button
                    type="button"
                    onClick={() => void copyPointField(key)}
                    className="cursor-pointer rounded bg-neutral-200 px-1.5 py-0.5"
                  >
                    복사
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};

export default LightOriginPanel;
