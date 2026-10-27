'use client';
// 관리자 리그 저작 도구 — /dev/rig의 파트 패널·3D 캔버스·관절 패널을 그대로 이식하고,
// 산출물만 클립보드 대신 PUT /admin/products/{id}/asset 의 rigManifest로 보낸다.
// validateManifest를 통과할 때만 저장 버튼이 열린다(반쯤 조립된 계층을 저장할 수 없다).

import { useEffect, useState } from 'react';

import InlineNotice from '@/components/common/InlineNotice';
import RigCanvas from '@/components/dev/rig/RigCanvas';
import RigJointPanel from '@/components/dev/rig/RigJointPanel';
import RigPartPanel from '@/components/dev/rig/RigPartPanel';
import { toManifest } from '@/three/core/rigDraft';
import type { RigManifest } from '@/three/scene/product';
import { useRigDraftStore } from '@/store/rigDraftStore';
import AssetRigPoseBar from './AssetRigPoseBar';

type Props = {
  /** 업로드 직후의 blob URL 또는 이미 등록된 에셋의 presigned URL. */
  glbUrl: string;
  sourceLabel: string;
  /** 저장돼 있던 매니페스트. 마운트 때 한 번만 읽으므로 참조가 흔들리지 않아야 한다. */
  initialManifest: RigManifest | null;
  /** null이 아니면 저장을 막고 이 문구를 띄운다(assetKey 부재 등). */
  saveBlockedReason: string | null;
  onSave: (manifest: RigManifest) => Promise<void>;
};

const AssetRigAuthor = ({
  glbUrl,
  sourceLabel,
  initialManifest,
  saveBlockedReason,
  onSave,
}: Props) => {
  const draft = useRigDraftStore((s) => s.draft);
  const errors = useRigDraftStore((s) => s.errors);
  const loadError = useRigDraftStore((s) => s.loadError);
  const openAssetSource = useRigDraftStore((s) => s.openAssetSource);
  const closeAssetSource = useRigDraftStore((s) => s.closeAssetSource);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isErrorListOpen, setIsErrorListOpen] = useState(false);

  useEffect(() => {
    void openAssetSource({ url: glbUrl, label: sourceLabel, manifest: initialManifest });
    // 소스를 놓지 않으면 다음 /dev/rig 방문이 이 관리자 GLB를 연다(store가 모듈 싱글턴이다).
    return () => {
      closeAssetSource();
    };
  }, [glbUrl, sourceLabel, initialManifest, openAssetSource, closeAssetSource]);

  const isValid = errors.length === 0;
  const canSave = isValid && saveBlockedReason === null && !isSaving;

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      await onSave(toManifest(draft));
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : '매니페스트 저장 중 오류가 발생했습니다.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="border-ash/20 flex flex-wrap items-center gap-3 rounded-t-[10px] border border-b-0 px-3 py-2">
        <span className="text-ash max-w-64 truncate text-[13px]" title={sourceLabel}>
          {sourceLabel}
        </span>

        <button
          type="button"
          onClick={() => setIsErrorListOpen((open) => !open)}
          disabled={isValid}
          className={`rounded-[10px] px-3 py-1.5 text-[13px] font-semibold ${
            isValid
              ? 'bg-success-50 text-success-700 cursor-default'
              : 'bg-danger-50 text-danger-700 cursor-pointer'
          }`}
        >
          {isValid ? '검증 통과' : `검증 오류 ${errors.length}건 ${isErrorListOpen ? '▴' : '▾'}`}
        </button>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          className="bg-highlight text-ink border-ash/20 hover:bg-primary-300 ml-auto cursor-pointer rounded-[10px] border px-4 py-1.5 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? '저장하는 중...' : '매니페스트 저장'}
        </button>
      </div>

      {!isValid && isErrorListOpen ? (
        <ul className="border-ash/20 text-danger-700 max-h-48 space-y-1 overflow-y-auto border border-b-0 px-3 py-2 text-[13px]">
          {errors.map((message) => (
            <li key={message}>• {message}</li>
          ))}
        </ul>
      ) : null}

      {/* dev 도구는 3열(파트·3D·관절)이지만 여기선 2행이다 — 두 패널이 w-64·w-96 고정폭이라
          3열로 두면 관리자 컨테이너(max-w-[1200px]) 안에서 캔버스가 좁은 세로 조각으로 눌린다.
          /dev/rig는 뷰포트 전체 폭이라 같은 문제가 없다. 높이를 정하지 않으면 캔버스가 0px이
          된다(RigCanvas가 h-full이다). 아래 행의 flex-1은 고정폭을 이 화면에서만 늘려 채운다. */}
      <div className="border-ash/20 h-[420px] min-h-0 border text-neutral-800">
        <RigCanvas />
      </div>
      <div className="border-ash/20 flex h-[340px] min-h-0 border border-t-0 text-neutral-800 [&>aside]:flex-1">
        <RigPartPanel />
        <RigJointPanel />
      </div>

      <div className="border-ash/20 rounded-b-[10px] border border-t-0">
        <AssetRigPoseBar />
      </div>

      <p className="text-ash mt-2 text-[13px] leading-5">
        파트를 세그먼트로 묶고 관절의 축·피벗·한계를 정합니다. 피벗 기본값은 부모∩자식 bbox 교집합의
        중심을 제안한 값이라 실측 대비 2~12mm 어긋납니다 — 출발점으로 쓰고 Y·Z를 손보는 것이 정상
        절차입니다. 관절 편집은 이 [매니페스트 저장]으로만 반영되고, 위쪽 [에셋 저장]은 매니페스트를
        건드리지 않습니다.
      </p>

      {loadError !== null ? (
        <div className="mt-3">
          <InlineNotice
            variant="error"
            title="GLB를 열지 못했습니다"
            message={`${loadError} — 이 화면의 로더는 KTX2를 붙이지 않습니다. 텍스처가 박힌 GLB는 파트 분리 에셋이 아니므로 export 모드를 다시 확인하세요.`}
          />
        </div>
      ) : null}

      {saveBlockedReason !== null ? (
        <div className="mt-3">
          <InlineNotice variant="warning" message={saveBlockedReason} />
        </div>
      ) : null}

      {saveError !== null ? (
        <div className="mt-3">
          <InlineNotice variant="error" title="매니페스트 저장 실패" message={saveError} />
        </div>
      ) : null}
    </div>
  );
};

export default AssetRigAuthor;
