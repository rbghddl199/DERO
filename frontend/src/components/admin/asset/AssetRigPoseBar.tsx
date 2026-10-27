'use client';
// 관리자 리그 저작 하단 바 — driver 관절 미리보기 슬라이더만 둔다. dev의 RigPoseBar와 달리
// TS/JSON 복사가 없다: 관리자 플로우의 산출물은 클립보드가 아니라 asset.rig_manifest다.

import { isDriver, jointKind, jointLimits } from '@/three/core/rig';
import { useRigDraftStore } from '@/store/rigDraftStore';

const AssetRigPoseBar = () => {
  const joints = useRigDraftStore((s) => s.draft.joints);
  const errors = useRigDraftStore((s) => s.errors);
  const driverValues = useRigDraftStore((s) => s.driverValues);
  const setDriverValue = useRigDraftStore((s) => s.setDriverValue);
  const resetPose = useRigDraftStore((s) => s.resetPose);

  const isValid = errors.length === 0;
  // 종속 관절(coupledTo)은 슬라이더에 뜨지 않는다 — 사용자가 만지는 것은 driver뿐이다.
  const drivers = joints.filter(isDriver);

  return (
    <footer className="border-ash/20 flex shrink-0 items-start gap-3 border-t px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1">
        {!isValid ? (
          <p className="text-danger-700 text-[13px]">
            검증을 통과해야 미리보기가 움직입니다 — {errors[0]}
          </p>
        ) : null}
        {isValid && drivers.length === 0 ? (
          <p className="text-ash text-[13px]">
            driver 관절이 없습니다. 관절 없는 에셋은 매니페스트 없이 등록해도 됩니다.
          </p>
        ) : null}
        {isValid
          ? drivers.map((joint) => {
              const { min, max } = jointLimits(joint);
              const unit = jointKind(joint) === 'prismatic' ? 'mm' : '°';
              const value = driverValues[joint.joint] ?? 0;

              return (
                <label key={joint.joint} className="text-ink flex items-center gap-1.5 text-[13px]">
                  <span className="w-24 truncate">{joint.label}</span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={1}
                    value={value}
                    onChange={(event) => setDriverValue(joint.joint, Number(event.target.value))}
                    className="accent-primary-500 cursor-pointer"
                  />
                  <span className="w-14 text-right tabular-nums">
                    {Math.round(value)}
                    {unit}
                  </span>
                </label>
              );
            })
          : null}
      </div>

      <button
        type="button"
        onClick={resetPose}
        className="border-ash/30 text-ink shrink-0 cursor-pointer rounded-[10px] border px-3 py-1.5 text-[13px]"
      >
        정지 포즈
      </button>
    </footer>
  );
};

export default AssetRigPoseBar;
