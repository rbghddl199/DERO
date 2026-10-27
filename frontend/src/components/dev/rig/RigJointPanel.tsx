'use client';
// 리그 저작 도구 우 패널 — 관절 접이식 목록(표시명·축·피벗·한계·종류·커플링) + 관절 추가 폼

import { useState } from 'react';
import { jointKind, jointLimits } from '@/three/core/rig';
import type { RigJoint } from '@/three/scene/product';
import { useRigDraftStore } from '@/store/rigDraftStore';
import NumField from './NumField';

const NONE = '__none__';

/** 피벗은 실측상 기본값 휴리스틱 오차가 최대 11.5mm라 저작자가 반드시 손본다 — step을 작게. */
const PIVOT_STEP = 0.001;

const AXES: { label: string; axis: [number, number, number] }[] = [
  { label: '+X', axis: [1, 0, 0] },
  { label: '−X', axis: [-1, 0, 0] },
  { label: '+Y', axis: [0, 1, 0] },
  { label: '−Y', axis: [0, -1, 0] },
  { label: '+Z', axis: [0, 0, 1] },
  { label: '−Z', axis: [0, 0, -1] },
];

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-1 py-0.5">
    <span className="w-14 shrink-0 text-[11px] text-neutral-600">{label}</span>
    <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
  </div>
);

const JointForm = ({ joint }: { joint: RigJoint }) => {
  // 셀렉터는 스토어에 있는 참조를 그대로 돌려준다 — 파생 배열(Object.keys 등)을 만들면
  // zustand v5의 useSyncExternalStore가 매 스냅샷을 새 값으로 보고 무한 리렌더한다.
  const segmentMap = useRigDraftStore((s) => s.draft.segments);
  const allJoints = useRigDraftStore((s) => s.draft.joints);
  const patchJoint = useRigDraftStore((s) => s.patchJoint);
  const changeJointKind = useRigDraftStore((s) => s.changeJointKind);
  const deleteJoint = useRigDraftStore((s) => s.deleteJoint);

  const segments = Object.keys(segmentMap);
  const kind = jointKind(joint);
  const prismatic = kind === 'prismatic';
  const { min, max } = jointLimits(joint);
  const unit = prismatic ? 'mm' : '°';
  const coupling = joint.coupledTo;

  return (
    <div className="border-t border-neutral-200 bg-white px-2 py-1">
      <Row label="표시명">
        <input
          className="w-full min-w-0 rounded border border-neutral-300 px-1 py-0.5 text-[11px]"
          value={joint.label}
          onChange={(e) => patchJoint(joint.joint, { label: e.target.value })}
        />
      </Row>

      <Row label="부모">
        <select
          className="min-w-0 flex-1 rounded border border-neutral-300 px-1 py-0.5 text-[11px]"
          value={joint.parent}
          onChange={(e) => patchJoint(joint.joint, { parent: e.target.value })}
        >
          {segments.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="min-w-0 flex-1 rounded border border-neutral-300 px-1 py-0.5 text-[11px]"
          value={joint.child}
          onChange={(e) => patchJoint(joint.joint, { child: e.target.value })}
        >
          {segments.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Row>

      <Row label="축">
        {AXES.map((a) => {
          const active = a.axis.every((v, i) => joint.axis[i] === v);
          return (
            <button
              key={a.label}
              type="button"
              onClick={() => patchJoint(joint.joint, { axis: [...a.axis] })}
              className={`cursor-pointer rounded px-1.5 py-0.5 font-mono text-[11px] ${
                active ? 'bg-neutral-700 text-white' : 'bg-neutral-200'
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </Row>

      <Row label="피벗">
        {(['x', 'y', 'z'] as const).map((axisName, i) => (
          <NumField
            key={axisName}
            label={axisName}
            step={PIVOT_STEP}
            value={joint.point[i]}
            onCommit={(n) => {
              const point: [number, number, number] = [...joint.point];
              point[i] = n;
              patchJoint(joint.joint, { point });
            }}
          />
        ))}
      </Row>

      <Row label={`한계(${unit})`}>
        <NumField
          label="min"
          step={1}
          value={min}
          onCommit={(n) => patchJoint(joint.joint, prismatic ? { minMm: n } : { minDeg: n })}
        />
        <NumField
          label="max"
          step={1}
          value={max}
          onCommit={(n) => patchJoint(joint.joint, prismatic ? { maxMm: n } : { maxDeg: n })}
        />
      </Row>

      <Row label="종류">
        {(['revolute', 'prismatic'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => changeJointKind(joint.joint, k)}
            className={`cursor-pointer rounded px-1.5 py-0.5 text-[11px] ${
              kind === k ? 'bg-neutral-700 text-white' : 'bg-neutral-200'
            }`}
          >
            {k === 'revolute' ? '회전(°)' : '직선(mm)'}
          </button>
        ))}
      </Row>

      <Row label="커플링">
        <select
          className="min-w-0 flex-1 rounded border border-neutral-300 px-1 py-0.5 text-[11px]"
          value={coupling?.joint ?? NONE}
          onChange={(e) =>
            patchJoint(
              joint.joint,
              e.target.value === NONE
                ? { coupledTo: undefined }
                : { coupledTo: { joint: e.target.value, ratio: coupling?.ratio ?? 1 } },
            )
          }
        >
          <option value={NONE}>(독립)</option>
          {allJoints
            .filter((j) => j.joint !== joint.joint)
            .map((j) => (
              <option key={j.joint} value={j.joint}>
                {j.joint}
              </option>
            ))}
        </select>
      </Row>

      {coupling && (
        <Row label="비율/오프셋">
          <NumField
            label="ratio"
            step={0.1}
            value={coupling.ratio}
            onCommit={(n) => patchJoint(joint.joint, { coupledTo: { ...coupling, ratio: n } })}
          />
          <NumField
            label="offset"
            step={1}
            value={coupling.offset ?? 0}
            onCommit={(n) => patchJoint(joint.joint, { coupledTo: { ...coupling, offset: n } })}
          />
        </Row>
      )}

      <button
        type="button"
        onClick={() => deleteJoint(joint.joint)}
        className="text-danger-700 mt-1 cursor-pointer text-[11px]"
      >
        관절 삭제
      </button>
    </div>
  );
};

const AddJointForm = () => {
  const segmentMap = useRigDraftStore((s) => s.draft.segments);
  const createJoint = useRigDraftStore((s) => s.createJoint);
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [parent, setParent] = useState('');
  const [child, setChild] = useState('');

  const segments = Object.keys(segmentMap);
  const disabled = segments.length < 2 || !id.trim() || !parent || !child;

  return (
    <form
      className="border-b border-neutral-300 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled) return;
        createJoint({
          joint: id.trim(),
          label: label.trim() || id.trim(),
          parent,
          child,
        });
        setId('');
        setLabel('');
      }}
    >
      <div className="flex gap-1">
        <input
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1 py-0.5 text-[11px]"
          placeholder="관절 id"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <input
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1 py-0.5 text-[11px]"
          placeholder="표시명"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div className="mt-1 flex gap-1">
        <select
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1 py-0.5 text-[11px]"
          value={parent}
          onChange={(e) => setParent(e.target.value)}
        >
          <option value="">부모 세그먼트</option>
          {segments.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1 py-0.5 text-[11px]"
          value={child}
          onChange={(e) => setChild(e.target.value)}
        >
          <option value="">자식 세그먼트</option>
          {segments.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={disabled}
          className="cursor-pointer rounded bg-neutral-700 px-2 py-0.5 text-[11px] text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          + 관절
        </button>
      </div>
    </form>
  );
};

const RigJointPanel = () => {
  const joints = useRigDraftStore((s) => s.draft.joints);
  const expandedJoint = useRigDraftStore((s) => s.expandedJoint);
  const expandJoint = useRigDraftStore((s) => s.expandJoint);

  return (
    // w-96 — 피벗 x/y/z 3칸이 소수 4자리 + 스피너까지 잘리지 않는 최소 폭이다.
    <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-neutral-300 bg-neutral-50">
      <AddJointForm />
      <ul>
        {joints.map((j) => {
          const open = expandedJoint === j.joint;
          return (
            <li key={j.joint}>
              <button
                type="button"
                // 펼치면 focusJoint(id)로 피벗 구슬·축 화살표가 뜨고, 접으면 사라진다.
                onClick={() => expandJoint(open ? null : j.joint)}
                className={`flex w-full cursor-pointer items-center gap-1 px-2 py-1 text-left text-xs ${
                  open ? 'bg-primary-100' : 'hover:bg-neutral-200'
                }`}
              >
                <span className="w-3 shrink-0">{open ? '▾' : '▸'}</span>
                <span className="min-w-0 flex-1 truncate">{j.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-neutral-500">{j.joint}</span>
                {j.coupledTo && <span className="shrink-0 text-[10px]">🔗</span>}
              </button>
              {open && <JointForm joint={j} />}
            </li>
          );
        })}
        {joints.length === 0 && (
          <li className="px-2 py-2 text-xs text-neutral-500">관절이 없습니다</li>
        )}
      </ul>
    </aside>
  );
};

export default RigJointPanel;
