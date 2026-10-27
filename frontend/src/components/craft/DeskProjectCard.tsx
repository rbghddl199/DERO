'use client';
// 내 데스크테리어 카드 — 썸네일 + 이름, 클릭 시 시뮬레이터에서 이어서 수정.
// isSelecting이면 Link 대신 선택 토글 버튼으로 바뀐다(CraftDeskCollection의 삭제 흐름).
import { useRouter } from 'next/navigation';
import RemoteImage from '@/components/common/RemoteImage';
import SimulatorEntryWarningDialog from '@/components/common/SimulatorEntryWarningDialog';
import { useSimulatorEntryGuard } from '@/hooks/useSimulatorEntryGuard';
import type { DeskProject } from '@/types/craft';
import { formatDateTime } from '@/utils/formatDateTime';
import DeskPublishControl from './DeskPublishControl';

type Props = {
  project: DeskProject;
  isSelecting?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
};

const DeskProjectCard = ({
  project,
  isSelecting = false,
  isSelected = false,
  onToggleSelect,
}: Props) => {
  // thumbnailUrl은 결정론적 백엔드 경로라 항상 "있음"으로 보인다 — 아직 안 찍은 배치는
  // 404가 나므로 로드 실패를 직접 감지해 "미리보기 없음"으로 폴백한다(RemoteImage가 감지한다).
  const noPreview = (
    <div className="text-ash flex h-full w-full items-center justify-center text-[14px]">
      미리보기 없음
    </div>
  );
  const router = useRouter();
  const {
    pending: hwaccelPending,
    guardEntry: guardSimulatorEntry,
    cancel: cancelSimulatorEntry,
    proceedAnyway: proceedSimulatorEntryAnyway,
  } = useSimulatorEntryGuard();
  const simulatorHref = `/simulator?deskProjectId=${project.id}`;

  const content = (
    <>
      <div
        className={`border-ash/40 bg-fog relative aspect-square overflow-hidden rounded-2xl border ${
          isSelected ? 'ring-primary-500 ring-2 ring-offset-2' : ''
        }`}
      >
        {project.thumbnailUrl ? (
          <RemoteImage
            src={project.thumbnailUrl}
            alt={project.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
            fallback={noPreview}
          />
        ) : (
          noPreview
        )}
        {isSelecting && (
          <span
            aria-hidden="true"
            className={`absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
              isSelected
                ? 'border-primary-500 bg-primary-500 text-white'
                : 'border-ash/60 bg-white/80'
            }`}
          >
            {isSelected && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12l5 5L19 7" />
              </svg>
            )}
          </span>
        )}
      </div>
      <p className="text-ink group-hover:text-primary-700 mt-2 truncate text-[16px] font-medium">
        {project.name}
      </p>
      <p className="text-ash flex items-center gap-1 text-[13px]">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
        {formatDateTime(project.updatedAt)}
      </p>
    </>
  );

  if (isSelecting) {
    return (
      <button
        type="button"
        onClick={() => onToggleSelect?.(project.id)}
        aria-pressed={isSelected}
        className="group block w-full text-left"
      >
        {content}
      </button>
    );
  }

  // 업로드 컨트롤은 Link 밖에 둔다 — 버튼을 링크 안에 넣으면 카드 클릭이 시뮬레이터 이동과
  // 겹친다. 서버에 저장된 적 없는 낙관적 로컬 항목(id가 crypto.randomUUID())은 업로드할 배치
  // 자체가 없으므로 컨트롤을 안 그린다(CraftDeskCollection의 삭제 분기와 같은 판별).
  const isSavedOnServer = !Number.isNaN(Number(project.id));

  return (
    <div>
      <button
        type="button"
        onClick={() => guardSimulatorEntry(() => router.push(simulatorHref))}
        className="group block w-full text-left"
      >
        {content}
      </button>
      {isSavedOnServer && <DeskPublishControl project={project} />}
      {hwaccelPending && (
        <SimulatorEntryWarningDialog
          status={hwaccelPending.status}
          browserKind={hwaccelPending.browserKind}
          onClose={cancelSimulatorEntry}
          onProceedAnyway={proceedSimulatorEntryAnyway}
        />
      )}
    </div>
  );
};

export default DeskProjectCard;
