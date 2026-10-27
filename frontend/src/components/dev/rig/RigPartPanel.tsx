'use client';
// 리그 저작 도구 좌 패널 — 파트(mesh) 목록·세그먼트 배정. 행 hover/클릭이 3D 하이라이트와 양방향으로 붙는다

import { useState } from 'react';
import { useRigDraftStore } from '@/store/rigDraftStore';

const NONE = '__none__';

const SegmentChips = () => {
  const segments = useRigDraftStore((s) => s.draft.segments);
  const supportPart = useRigDraftStore((s) => s.draft.supportPart);
  const mountPart = useRigDraftStore((s) => s.draft.mountPart);
  const deleteSegment = useRigDraftStore((s) => s.deleteSegment);
  const setSupportPart = useRigDraftStore((s) => s.setSupportPart);
  const setMountPart = useRigDraftStore((s) => s.setMountPart);
  const createSegment = useRigDraftStore((s) => s.createSegment);
  const [name, setName] = useState('');

  const names = Object.keys(segments);

  return (
    <div className="border-b border-neutral-300 p-2">
      <div className="mb-1 flex flex-wrap gap-1">
        {names.map((n) => (
          <span
            key={n}
            className="flex items-center gap-1 rounded bg-neutral-200 px-1.5 py-0.5 text-[11px]"
          >
            {n}
            <span className="text-neutral-500">({segments[n].length})</span>
            <button
              type="button"
              title="세그먼트 삭제 (참조하는 관절도 함께 지워진다)"
              className="text-danger-700 cursor-pointer"
              onClick={() => deleteSegment(n)}
            >
              ×
            </button>
          </span>
        ))}
        {names.length === 0 && <span className="text-[11px] text-neutral-500">세그먼트 없음</span>}
      </div>

      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          createSegment(name);
          setName('');
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-1 text-xs"
          placeholder="새 세그먼트 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className="cursor-pointer rounded bg-neutral-700 px-2 py-1 text-xs text-white"
        >
          + 세그먼트 추가
        </button>
      </form>

      {/* 지지 세그먼트는 매니페스트 필드(supportPart)라 저작 대상이지만 파트 행에는 자리가 없다. */}
      <label className="mt-2 flex items-center gap-1 text-[11px]">
        <span className="text-neutral-600">지지 세그먼트</span>
        <select
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1 py-0.5 text-[11px]"
          value={supportPart ?? NONE}
          onChange={(e) => setSupportPart(e.target.value === NONE ? null : e.target.value)}
        >
          <option value={NONE}>(없음)</option>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      {/* 결합 세그먼트(mountPart)도 같은 이유로 여기 있다 — 자석 결합(D22)의 부모가 되는 값. */}
      <label className="mt-2 flex items-center gap-1 text-[11px]">
        <span className="text-neutral-600">결합 세그먼트</span>
        <select
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1 py-0.5 text-[11px]"
          value={mountPart ?? NONE}
          onChange={(e) => setMountPart(e.target.value === NONE ? null : e.target.value)}
        >
          <option value={NONE}>(없음)</option>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-[11px] text-neutral-500">
        모니터가 물리는 파트(헤드·마운트)다. 다른 제품이 안 물리는 에셋은 비워 둬도 등록된다.
      </p>
    </div>
  );
};

const RigPartPanel = () => {
  const parts = useRigDraftStore((s) => s.parts);
  const segments = useRigDraftStore((s) => s.draft.segments);
  const selectedPart = useRigDraftStore((s) => s.selectedPart);
  const hoverPart = useRigDraftStore((s) => s.hoverPart);
  const selectPart = useRigDraftStore((s) => s.selectPart);
  const setPartSegment = useRigDraftStore((s) => s.setPartSegment);

  const names = Object.keys(segments);
  const ownerOf = (node: string): string => names.find((n) => segments[n].includes(node)) ?? NONE;

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-neutral-300 bg-neutral-50">
      <SegmentChips />
      <ul onMouseLeave={() => hoverPart(null)}>
        {parts.map((node) => (
          <li
            key={node}
            onMouseEnter={() => hoverPart(node)}
            onClick={() => selectPart(node)}
            className={`flex items-center gap-1 px-2 py-1 text-xs ${
              selectedPart === node ? 'bg-primary-100' : 'hover:bg-neutral-200'
            }`}
          >
            <span className="w-16 shrink-0 cursor-pointer font-mono">{node}</span>
            <select
              className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1 py-0.5 text-[11px]"
              value={ownerOf(node)}
              onChange={(e) =>
                setPartSegment(node, e.target.value === NONE ? null : e.target.value)
              }
            >
              <option value={NONE}>(미배정)</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </li>
        ))}
        {parts.length === 0 && (
          <li className="px-2 py-2 text-xs text-neutral-500">로드된 파트가 없습니다</li>
        )}
      </ul>
    </aside>
  );
};

export default RigPartPanel;
