'use client';
// 리그 저작 도구 하단 바 — driver 관절 미리보기 슬라이더(검증 통과 시에만 활성) + 정지 포즈·TS/JSON 복사

import { isDriver, jointKind, jointLimits } from '@/three/core/rig';
import { useRigDraftStore } from '@/store/rigDraftStore';

const RigPoseBar = () => {
  const joints = useRigDraftStore((s) => s.draft.joints);
  const errors = useRigDraftStore((s) => s.errors);
  const driverValues = useRigDraftStore((s) => s.driverValues);
  const setDriverValue = useRigDraftStore((s) => s.setDriverValue);
  const resetPose = useRigDraftStore((s) => s.resetPose);
  const copyTs = useRigDraftStore((s) => s.copyTs);
  const copyJson = useRigDraftStore((s) => s.copyJson);

  const ok = errors.length === 0;
  // 종속 관절(coupledTo)은 슬라이더에 뜨지 않는다 — 사용자가 만지는 것은 driver뿐이다.
  const drivers = joints.filter(isDriver);

  return (
    <footer className="flex shrink-0 items-start gap-3 border-t border-neutral-300 bg-neutral-100 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1">
        {!ok && (
          <p className="text-danger-700 text-xs">검증 실패로 미리보기 비활성 — {errors[0]}</p>
        )}
        {ok && drivers.length === 0 && (
          <p className="text-xs text-neutral-500">driver 관절이 없습니다</p>
        )}
        {ok &&
          drivers.map((j) => {
            const { min, max } = jointLimits(j);
            const unit = jointKind(j) === 'prismatic' ? 'mm' : '°';
            const value = driverValues[j.joint] ?? 0;
            return (
              <label key={j.joint} className="flex items-center gap-1 text-xs">
                <span className="w-20 truncate">{j.label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={1}
                  value={value}
                  onChange={(e) => setDriverValue(j.joint, Number(e.target.value))}
                />
                <span className="w-12 text-right font-mono text-[11px]">
                  {Math.round(value)}
                  {unit}
                </span>
              </label>
            );
          })}
      </div>

      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={resetPose}
          className="cursor-pointer rounded bg-neutral-200 px-2 py-1 text-xs"
        >
          정지 포즈
        </button>
        <button
          type="button"
          onClick={() => void copyTs()}
          className="cursor-pointer rounded bg-neutral-700 px-2 py-1 text-xs text-white"
        >
          TS 블록 복사
        </button>
        <button
          type="button"
          onClick={() => void copyJson()}
          className="cursor-pointer rounded bg-neutral-700 px-2 py-1 text-xs text-white"
        >
          JSON 복사
        </button>
      </div>
    </footer>
  );
};

export default RigPoseBar;
