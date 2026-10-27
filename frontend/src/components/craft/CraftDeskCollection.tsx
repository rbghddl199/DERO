'use client';
// /craft 총 개수 + 정렬 필터 + 삭제하기(선택 삭제) + 구분선 + 그리드
// 정렬은 클라이언트에서만 적용(서버는 목록을 그대로 내려줌). 삭제는 deletePlacement로
// 실제 API 연동 — 성공한 id만 로컬에서 걷어내 목록을 갱신한다(라우트 리페치 없음).
// 서버 목록(props.projects) + craftProjectsStore(시뮬레이터에서 방금 저장한 세션 로컬 낙관적
// 항목, simulatorStore.trySave 참고)를 병합해 보여준다 — 백엔드가 항상 떠 있지 않아
// getDeskProjects()가 늘 빈 배열을 주는 로컬 개발 환경 대응(2026-07-31 사용자 확인).

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/api/client';
import { deletePlacement } from '@/api/placement';
import InlineNotice from '@/components/common/InlineNotice';
import SimulatorEntryWarningDialog from '@/components/common/SimulatorEntryWarningDialog';
import SortDropdown from '@/components/common/SortDropdown';
import { useSimulatorEntryGuard } from '@/hooks/useSimulatorEntryGuard';
import { useCraftProjectsStore } from '@/store/craftProjectsStore';
import type { DeskProject } from '@/types/craft';
import CraftEmptyState from './CraftEmptyState';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import DeskProjectList from './DeskProjectList';

type SortOrder = 'latest' | 'oldest' | 'price';

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'latest', label: '최신 순' },
  { value: 'oldest', label: '오래된 순' },
  { value: 'price', label: '가격 순' },
];

function sortProjects(projects: DeskProject[], order: SortOrder): DeskProject[] {
  const sorted = [...projects];
  if (order === 'latest') {
    sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } else if (order === 'oldest') {
    sorted.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  } else {
    sorted.sort((a, b) => a.budgetKrw - b.budgetKrw);
  }
  return sorted;
}

function getDeleteErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '삭제에 실패했어요. 다시 시도해 주세요.';
}

const TrashIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M4 7h16" />
    <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
  </svg>
);

type Props = {
  projects: DeskProject[];
};

const CraftDeskCollection = ({ projects }: Props) => {
  const router = useRouter();
  const {
    pending: hwaccelPending,
    guardEntry: guardSimulatorEntry,
    cancel: cancelSimulatorEntry,
    proceedAnyway: proceedSimulatorEntryAnyway,
  } = useSimulatorEntryGuard();
  const localProjects = useCraftProjectsStore((state) => state.projects);
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 로컬(방금 저장) 항목을 우선하고, 서버 목록엔 있지만 로컬엔 없는(아직 이 세션에서 안 건드린)
  // 항목을 뒤에 붙인다 — id가 겹치면(재저장으로 서버 id를 받은 경우) 로컬 항목이 최신이라 그걸 쓴다.
  // publishStatus만은 서버 값이 이긴다 — 로컬 항목은 저장 시점에 'PRIVATE'로 만들어지는데
  // (저장은 게시 상태를 안 바꾼다, ADR-0015 결정 10) 그대로 앞세우면 이미 공개된 배치를 다시
  // 저장했을 때 카드가 "비공개"라고 거짓말한다.
  const mergedProjects = useMemo(() => {
    const localIds = new Set(localProjects.map((project) => project.id));
    const serverById = new Map(projects.map((project) => [project.id, project]));
    return [
      ...localProjects.map((local) => {
        const server = serverById.get(local.id);
        return server ? { ...local, publishStatus: server.publishStatus } : local;
      }),
      ...projects.filter((project) => !localIds.has(project.id)),
    ];
  }, [projects, localProjects]);

  const sortedProjects = useMemo(() => {
    const visible = mergedProjects.filter((project) => !deletedIds.has(project.id));
    return sortProjects(visible, sortOrder);
  }, [mergedProjects, deletedIds, sortOrder]);

  const handleToggleSelectMode = (): void => {
    setIsSelecting(true);
    setSelectedIds(new Set());
    setDeleteError(null);
  };

  const handleCancelSelecting = (): void => {
    setIsSelecting(false);
    setSelectedIds(new Set());
    setDeleteError(null);
  };

  const handleToggleSelect = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleRequestDelete = (): void => {
    if (selectedIds.size === 0) return;
    setShowConfirm(true);
  };

  const handleConfirmDelete = async (): Promise<void> => {
    setIsDeleting(true);
    setDeleteError(null);

    const ids = Array.from(selectedIds);
    // 로컬 전용 id(크래프트 스토어가 생성한 crypto.randomUUID())는 숫자로 변환이 안 된다 — 서버에
    // 저장된 적 없는 항목이라 deletePlacement 대신 로컬 스토어에서만 지운다(simulatorStore.trySave의
    // localCraftId 참고). 재저장으로 서버 id를 받은 항목은 여기서 정상적으로 숫자라 API로 지운다.
    const results = await Promise.allSettled(
      ids.map((id) => {
        if (Number.isNaN(Number(id))) {
          useCraftProjectsStore.getState().removeProject(id);
          return Promise.resolve();
        }
        return deletePlacement(Number(id));
      }),
    );

    const succeededIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    const failedResult = results.find((result) => result.status === 'rejected') as
      PromiseRejectedResult | undefined;

    setDeletedIds((prev) => {
      const next = new Set(prev);
      succeededIds.forEach((id) => next.add(id));
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      succeededIds.forEach((id) => next.delete(id));
      return next;
    });

    setIsDeleting(false);
    setShowConfirm(false);

    if (failedResult) {
      const failedCount = ids.length - succeededIds.length;
      setDeleteError(
        `${failedCount}개를 삭제하지 못했어요. ${getDeleteErrorMessage(failedResult.reason)}`,
      );
      return;
    }

    setIsSelecting(false);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-[15px] text-neutral-500">총 {sortedProjects.length}개</p>
          <SortDropdown
            options={SORT_OPTIONS}
            value={sortOrder}
            onChange={(value) => setSortOrder(value as SortOrder)}
          />
        </div>

        {isSelecting ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelSelecting}
              className="border-ash/40 text-ink hover:bg-fog rounded-lg border px-3 py-1.5 text-[14px] font-medium transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleRequestDelete}
              disabled={selectedIds.size === 0}
              className="bg-danger-500 hover:bg-danger-700 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[14px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              <TrashIcon />
              {selectedIds.size}개 삭제
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => guardSimulatorEntry(() => router.push('/craft/new'))}
              className="bg-primary-200 hover:bg-primary-400 active:bg-primary-500 text-ink flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[14px] font-medium whitespace-nowrap transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              새로 만들기
            </button>
            <button
              type="button"
              onClick={handleToggleSelectMode}
              className="border-ash/40 text-ink hover:bg-fog flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[14px] font-medium transition-colors"
            >
              <TrashIcon />
              삭제하기
            </button>
          </div>
        )}
      </div>

      {deleteError && (
        <div className="mt-3">
          <InlineNotice variant="error" message={deleteError} />
        </div>
      )}

      <div className="border-ash/40 mt-4 border-b" />

      <div className="mt-6">
        {sortedProjects.length === 0 ? (
          <CraftEmptyState />
        ) : (
          <DeskProjectList
            projects={sortedProjects}
            isSelecting={isSelecting}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
          />
        )}
      </div>

      {showConfirm && (
        <DeleteConfirmDialog
          count={selectedIds.size}
          isDeleting={isDeleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowConfirm(false)}
        />
      )}

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

export default CraftDeskCollection;
