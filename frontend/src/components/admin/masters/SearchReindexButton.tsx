// 검색 인덱스 전량 재색인 버튼 — 브랜드 화면에 있는 이유는 재색인이 필요해지는 정기 사건이
// 브랜드 등록이기 때문이다(Nori 사용자 사전을 brand 테이블에서 굽는다, ADR-0019 결정 2).
// 무중단(새 인덱스를 채운 뒤 별칭 스왑)이라 확인 절차 없이 바로 실행한다.

'use client';

import { useState } from 'react';

import { reindexProductSearch } from '@/api/admin/search';
import { toMasterErrorMessage } from '@/components/admin/masters/masterErrors';
import Toast from '@/components/common/Toast';
import { MASTER_PRIMARY_BUTTON_CLASS } from '@/constants/admin/masters';

const SearchReindexButton = () => {
  const [isReindexing, setIsReindexing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleReindex = async (): Promise<void> => {
    setIsReindexing(true);
    try {
      // 건수를 그대로 띄운다 — 관리자가 성공을 눈으로 확인하라고 백엔드가 돌려주는 값이다.
      const result = await reindexProductSearch();
      setToastMessage(`색인 완료 — ${result.indexedCount.toLocaleString()}건`);
    } catch (error: unknown) {
      setToastMessage(toMasterErrorMessage(error, '재색인하지 못했습니다.'));
    } finally {
      setIsReindexing(false);
    }
  };

  return (
    <section className="border-ash/20 mt-8 rounded-2xl border p-6">
      <h2 className="text-ink text-[17px] font-semibold">검색 색인 다시 만들기</h2>
      <p className="text-ash mt-1 text-[13px] leading-5">
        브랜드를 등록·수정했으면 눌러 주세요. 제품 검색은 브랜드명을 사전에 담아 한 덩어리로
        인식하는데, 그 사전은 재색인할 때 브랜드 목록에서 다시 굽습니다 — 누르기 전까지 새 브랜드
        이름은 쪼개진 채로 검색됩니다. 새 인덱스를 다 채운 뒤 바꿔 달기 때문에 도는 동안에도 검색은
        그대로 됩니다.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={isReindexing}
          aria-busy={isReindexing}
          onClick={() => {
            void handleReindex();
          }}
          className={MASTER_PRIMARY_BUTTON_CLASS}
        >
          {isReindexing ? '색인 중' : '검색 색인 다시 만들기'}
        </button>
        {isReindexing ? (
          <span className="text-ash text-[13px]">전체 제품을 다시 색인하는 중입니다…</span>
        ) : null}
      </div>

      {toastMessage !== null ? (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      ) : null}
    </section>
  );
};

export default SearchReindexButton;
