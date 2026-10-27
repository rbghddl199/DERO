'use client';
// 내 데스크테리어 카드의 컬렉션 공개 상태·입구 — `PRIVATE`·`FAILED`면 "컬렉션에 올리기",
// `PENDING`이면 "업로드 중", `PUBLIC`이면 공개 취소 버튼.
//
// **게시 입구가 2026-08-11에 여기로 왔다**(D33·ADR-0036 결정 4) — 제목·설명·태그는 카드가 여는
// 경량 시트(`CollectionPublishSheet`)가 받고, 정본은 `placement.title`·`description`이다.
// 2026-08-02~2026-08-11의 "입구는 `/collection/new` 하나" 규칙과 그 근거였던 localStorage
// 사이드카는 폐기됐다 — 배치에 컬렉션 전용 필드가 없다는 전제 자체가 틀렸다.
// **FAILED 재게시도 같은 시트다** — 재시도 전용 UI를 따로 만들지 않는다.
//
// 진행 폴링은 여기가 아니라 전역 워처(`common/UploadWatcherBootstrap.tsx`)가 한다 — 카드가 폴링하면
// /craft를 떠난 사용자는 완료 알림을 못 받고, 카드 N장이면 3초마다 요청이 N배다.

import { useState } from 'react';
import { unpublishPlacementFromFeed } from '@/api/placement';
import { PUBLISH_STATUS_LABEL } from '@/constants/placementPublish';
import { useUploadNotificationsStore } from '@/store/uploadNotificationsStore';
import type { DeskProject } from '@/types/craft';
import type { PublishStatus } from '@/types/placement';
import { placementPublishErrorMessage } from '@/utils/placementPublishError';
import CollectionPublishSheet from './CollectionPublishSheet';

type Props = {
  project: DeskProject;
};

const DeskPublishControl = ({ project }: Props) => {
  const placementId = Number(project.id);
  const notifications = useUploadNotificationsStore((s) => s.notifications);
  const watches = useUploadNotificationsStore((s) => s.watches);
  const forgetPlacement = useUploadNotificationsStore((s) => s.forgetPlacement);
  /** 공개 취소·게시 요청으로 이 화면에서 직접 바꾼 값 — 목록 재조회 없이도 즉시 반영한다. */
  const [localStatus, setLocalStatus] = useState<PublishStatus>(project.publishStatus);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // 파생값은 셀렉터가 아니라 본문에서 만든다(zustand v5 무한 리렌더 함정, frontend/CLAUDE.md).
  const isWatched = watches.some((watch) => watch.placementId === placementId);
  const terminal = notifications.find(
    (item) => item.placementId === placementId && item.kind !== 'started',
  );

  // terminal은 succeeded·failed뿐이다. 폴링 상한을 넘긴 건은 알림이 안 생기고 감시만 접히므로
  // 여기선 서버가 준 값(localStatus)으로 떨어진다.
  const status: PublishStatus = isWatched
    ? 'PENDING'
    : terminal?.kind === 'succeeded'
      ? 'PUBLIC'
      : terminal?.kind === 'failed'
        ? 'FAILED'
        : localStatus;

  const handleUnpublish = async (): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await unpublishPlacementFromFeed(placementId);
      setLocalStatus('PRIVATE');
      // 내린 배치는 상세가 404다 — 알림을 남기면 죽은 링크가 된다.
      forgetPlacement(placementId);
    } catch (unpublishError) {
      setError(placementPublishErrorMessage(unpublishError));
    } finally {
      setIsBusy(false);
    }
  };

  const sheet = isSheetOpen && (
    <CollectionPublishSheet
      placementId={placementId}
      defaultTitle={project.name}
      isRetry={status === 'FAILED'}
      onClose={() => setIsSheetOpen(false)}
      onAccepted={() => {
        setIsSheetOpen(false);
        // 202는 "접수"다 — 카드는 바로 PENDING을 보이고, 완료·실패는 전역 워처가 알린다.
        setLocalStatus('PENDING');
      }}
    />
  );

  if (status === 'PENDING') {
    return (
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span
          className="bg-warning-50 text-warning-700 rounded-full px-2 py-0.5 text-[12px] font-medium"
          data-testid="publish-status-badge"
        >
          {PUBLISH_STATUS_LABEL.PENDING}
        </span>
        <span className="text-ash text-[12px]">상상도 만드는 중…</span>
      </div>
    );
  }

  // PRIVATE·FAILED가 게시 입구다(D33·ADR-0036) — 실패는 문구만 다르고 같은 시트로 다시 올린다.
  if (status !== 'PUBLIC') {
    return (
      <div className="mt-1.5 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          {status === 'FAILED' ? (
            <span className="bg-danger-50 text-danger-700 rounded-full px-2 py-0.5 text-[12px] font-medium">
              {PUBLISH_STATUS_LABEL.FAILED}
            </span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => setIsSheetOpen(true)}
            className="border-ash/40 text-ink hover:bg-fog cursor-pointer rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors"
          >
            {status === 'FAILED' ? '다시 올리기' : '컬렉션에 올리기'}
          </button>
        </div>
        {sheet}
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handleUnpublish}
          disabled={isBusy}
          className="border-ash/40 text-ink hover:bg-fog cursor-pointer rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          공개 취소
        </button>
      </div>

      {error !== null && (
        <p role="status" className="text-danger-700 text-[12px] leading-4">
          {error}
        </p>
      )}
    </div>
  );
};

export default DeskPublishControl;
