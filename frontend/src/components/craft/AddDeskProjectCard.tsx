'use client';
// 새 데스크테리어 추가 카드 — 목록 그리드 첫 칸(좌측 상단) 고정, 클릭 시 책상 선택
// 단계(/craft/new)로 이동 — 책상은 시뮬레이터 진입 전 여기서 먼저 고른다. 하드웨어 가속이
// 꺼져 있으면 이동 전에 SimulatorEntryWarningDialog로 먼저 경고한다(useSimulatorEntryGuard).
import { useRouter } from 'next/navigation';
import SimulatorEntryWarningDialog from '@/components/common/SimulatorEntryWarningDialog';
import { useSimulatorEntryGuard } from '@/hooks/useSimulatorEntryGuard';

const AddDeskProjectCard = () => {
  const router = useRouter();
  const {
    pending: hwaccelPending,
    guardEntry: guardSimulatorEntry,
    cancel: cancelSimulatorEntry,
    proceedAnyway: proceedSimulatorEntryAnyway,
  } = useSimulatorEntryGuard();

  return (
    <>
      <button
        type="button"
        onClick={() => guardSimulatorEntry(() => router.push('/craft/new'))}
        className="group block w-full self-start text-left"
      >
        <div className="border-ash/40 bg-fog group-hover:border-primary-300 flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed transition-colors">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            className="text-ash group-hover:text-primary-700"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="text-ash group-hover:text-primary-700 text-[14px] font-medium">
            새 데스크테리어 추가
          </span>
        </div>
      </button>
      {hwaccelPending && (
        <SimulatorEntryWarningDialog
          status={hwaccelPending.status}
          browserKind={hwaccelPending.browserKind}
          onClose={cancelSimulatorEntry}
          onProceedAnyway={proceedSimulatorEntryAnyway}
        />
      )}
    </>
  );
};

export default AddDeskProjectCard;
