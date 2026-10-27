'use client';
// 등록 가이드 모달을 여는 버튼 — 열림 상태만 들고 있다. 제품 등록·수정 폼 제목 옆에 붙는다:
// 원래 에셋 패널 안(규격 폼·실사 이미지 뒤)에 있었는데 스크롤을 한참 내려야 나와서 아무도 못 봤다.

import { useState } from 'react';

import AssetGuideModal from './AssetGuideModal';

const AssetGuideButton = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="border-ash/30 text-ink shrink-0 cursor-pointer rounded-[10px] border px-4 py-2.5 text-[15px] font-semibold"
      >
        등록 가이드
      </button>

      {isOpen ? <AssetGuideModal onClose={() => setIsOpen(false)} /> : null}
    </>
  );
};

export default AssetGuideButton;
