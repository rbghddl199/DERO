'use client';
// 리그 저작 도구 상단 바 — 제품 드롭다운 + 검증 배지(펼치면 오류 전문)

import { useState } from 'react';
import { RIG_PRODUCTS, useRigDraftStore } from '@/store/rigDraftStore';

const RigTopBar = () => {
  const productId = useRigDraftStore((s) => s.productId);
  const selectProduct = useRigDraftStore((s) => s.selectProduct);
  const errors = useRigDraftStore((s) => s.errors);
  const [open, setOpen] = useState(false);

  const ok = errors.length === 0;

  return (
    <header className="relative flex items-center gap-3 border-b border-neutral-300 bg-neutral-100 px-4 py-2">
      <h1 className="text-sm font-semibold">리그 매니페스트 저작</h1>

      <label className="flex items-center gap-1 text-xs">
        <span className="text-neutral-600">제품</span>
        <select
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
          value={productId}
          onChange={(e) => {
            void selectProduct(e.target.value);
          }}
        >
          {RIG_PRODUCTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.id})
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={ok}
        className={`rounded px-2 py-1 text-xs font-medium ${
          ok
            ? 'bg-success-50 text-success-700 cursor-default'
            : 'bg-danger-50 text-danger-700 cursor-pointer'
        }`}
      >
        {ok ? '검증 통과' : `오류 ${errors.length}${open ? ' ▴' : ' ▾'}`}
      </button>

      {!ok && open && (
        <ul className="absolute top-full left-0 z-20 max-h-64 w-full overflow-y-auto border-b border-neutral-300 bg-white p-2 text-xs">
          {errors.map((msg) => (
            <li key={msg} className="text-danger-700 py-0.5">
              • {msg}
            </li>
          ))}
        </ul>
      )}
    </header>
  );
};

export default RigTopBar;
