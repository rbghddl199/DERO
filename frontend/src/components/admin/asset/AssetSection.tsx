'use client';
// 제품 3D 에셋 섹션 — presign 발급 → 스토리지 직접 PUT → assetKey 등록의 3단계와 등록 폼
// (export 모드·재질 프리셋·폴리곤 수), 그리고 파트 분리 에셋의 리그 저작 도구를 담는다.
// 경량화·Khronos 검증은 로컬 scripts/asset-pipeline.sh 몫이라 여기서 다시 하지 않는다.
// 이미 등록된 에셋은 상세가 준 assetKey를 그대로 되보내 재업로드 없이 메타만 고칠 수 있다.

import { useEffect, useState } from 'react';

import { registerProductAsset, requestAssetUploadUrl } from '@/api/admin/assets';
import { putToPresignedUrl } from '@/api/admin/uploads';
import InlineNotice from '@/components/common/InlineNotice';
import { NumberField, SelectField } from '@/components/admin/products/ProductFormFields';
import {
  ASSET_FINISH_OPTIONS,
  ASSET_REVIEW_STATUS_LABEL,
  GLB_CONTENT_TYPE,
  GLB_EXPORT_MODE_OPTIONS,
} from '@/constants/admin/asset';
import type { AssetDetailResponse, AssetDraft, GlbExportMode } from '@/types/admin/asset';
import type { RigManifest } from '@/three/scene/product';
import {
  assetDraftFromDetail,
  buildAssetPayload,
  rigManifestFromWire,
} from '@/utils/admin/assetDraft';
import { validateAsset } from '@/utils/admin/assetValidation';
import DynamicAssetRigAuthor from './DynamicAssetRigAuthor';

type Props = {
  productId: number;
  /** 서버에 저장돼 있는 값. 표시 전용이라 입력 초안과 섞지 않는다(마운트 때 한 번만 초안으로 편다). */
  asset: AssetDetailResponse | undefined;
  onSaved: () => Promise<void>;
  onToast: (message: string) => void;
};

/**
 * 등록 본문(AssetRegisterRequest)은 assetKey가 필수다. 상세 조회가 저장된 assetKey를 같이 주므로
 * (백엔드 DERO-315) 이미 등록된 에셋은 재업로드 없이 메타만 고쳐 그대로 되보낼 수 있고,
 * 이 문구가 남는 건 에셋 행 자체가 없는 신규 등록뿐이다.
 */
const NO_ASSET_KEY_REASON =
  '아직 등록된 GLB가 없습니다. 저장하려면 위 [GLB 올리기]로 .glb를 먼저 올리세요 — 등록 본문에는 assetKey가 반드시 들어갑니다.';

const toMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const AssetSection = ({ productId, asset, onSaved, onToast }: Props) => {
  // 마운트 시점에 한 번만 편다 — 저장 후 상세를 다시 읽어도 입력 중인 초안을 덮지 않는다.
  const [initialRig] = useState(() => rigManifestFromWire(asset?.rigManifest));
  const [draft, setDraft] = useState<AssetDraft>(() => assetDraftFromDetail(asset));
  const [rigManifest, setRigManifest] = useState<RigManifest | null>(initialRig?.manifest ?? null);

  // 저장된 키로 출발한다 — 새 GLB를 올리면 그때 발급받은 키로 교체된다(교체 = 파일 갈아끼우기).
  const [assetKey, setAssetKey] = useState<string | null>(() => asset?.assetKey ?? null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // blob URL은 반드시 되돌려준다 — 안 하면 GLB가 통째로 샌다(lightAuthorStore와 같은 규약).
  useEffect(() => {
    if (localUrl === null) return;
    return () => {
      URL.revokeObjectURL(localUrl);
    };
  }, [localUrl]);

  // 파생 상태라 렌더 중에 계산한다(CollectionUploadForm과 같은 방식).
  const errors = validateAsset(draft);
  const visibleErrors = hasAttemptedSubmit ? errors : {};
  const isValid = Object.keys(errors).length === 0;

  const isPartSegmentation = draft.glbExportMode === 'PART_SEGMENTATION';
  const glbUrl = localUrl ?? asset?.assetUrl ?? null;
  const sourceLabel = uploadedFileName ?? '등록된 에셋';
  const saveBlockedReason = assetKey === null ? NO_ASSET_KEY_REASON : null;

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

    try {
      // contentType은 실제 PUT 헤더와 같아야 서명 검증을 통과한다. 브라우저가 .glb의 File.type을
      // 못 채우는 경우가 있어 파일에서 유추하지 않고 상수를 쓴다.
      const presigned = await requestAssetUploadUrl(productId, { contentType: GLB_CONTENT_TYPE });
      if (!presigned.uploadUrl || !presigned.assetKey) {
        throw new Error('업로드 URL을 발급받지 못했습니다.');
      }

      await putToPresignedUrl(presigned.uploadUrl, file, GLB_CONTENT_TYPE);

      setAssetKey(presigned.assetKey);
      setUploadedFileName(file.name);
      setLocalUrl(URL.createObjectURL(file));
    } catch (error) {
      setUploadError(toMessage(error, 'GLB 업로드 중 오류가 발생했습니다.'));
    } finally {
      setIsUploading(false);
    }
  };

  /** 등록 본문은 항상 행 전체다(부분 수정이 없다) — 매니페스트 저장도 같은 호출을 쓴다. */
  const registerAsset = async (manifest: RigManifest | null) => {
    if (assetKey === null) {
      throw new Error(NO_ASSET_KEY_REASON);
    }
    await registerProductAsset(productId, buildAssetPayload(assetKey, draft, manifest));
    setRigManifest(manifest);
    await onSaved();
  };

  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);
    if (!isValid || assetKey === null) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await registerAsset(rigManifest);
      onToast('3D 에셋을 등록했습니다.');
    } catch (error) {
      setSubmitError(toMessage(error, '에셋 등록 중 오류가 발생했습니다.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveManifest = async (manifest: RigManifest) => {
    await registerAsset(manifest);
    onToast('리그 매니페스트를 저장했습니다.');
  };

  const handleExportModeChange = (value: string) => {
    const mode = (value === '' ? '' : value) as GlbExportMode | '';
    setDraft((prev) => ({
      ...prev,
      glbExportMode: mode,
      // 텍스처 융합은 재질 정본이 GLB 안이라 프리셋을 비운다(erd.md `asset.finish`).
      finish: mode === 'PART_SEGMENTATION' ? prev.finish : '',
    }));
  };

  return (
    <section
      id="asset"
      aria-labelledby="admin-product-asset-heading"
      className="border-ash/20 mt-6 rounded-2xl border p-6"
    >
      <h2 id="admin-product-asset-heading" className="text-ink text-[19px] font-semibold">
        3D 에셋 (GLB)
      </h2>
      <p className="text-ash mt-1 text-[13px] leading-5">
        제품 하나에 GLB 하나입니다. 카탈로그 노출은 규격 저장과 별개로 에셋 검수를 통과해야 합니다.
      </p>

      <div className="mt-4">
        <InlineNotice
          variant="info"
          title="올리기 전에 로컬 스크립트를 통과시키세요"
          message="scripts/asset-pipeline.sh <파일.glb> 한 줄이 해부·판정·경량화(meshopt+KTX2)·Khronos glTF-Validator 검증을 끝냅니다. 이 화면은 검증을 다시 하지 않으므로, 통과본만 올려 주세요."
        />
      </div>

      <table className="mt-5 w-full text-left text-[14px]">
        <tbody className="text-ink">
          <tr className="border-ash/20 border-b">
            <th scope="row" className="text-ash w-40 py-2 font-normal">
              현재 파일
            </th>
            <td className="py-2 break-all">
              {asset?.assetUrl ? (
                <a
                  href={asset.assetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-800 underline"
                >
                  presigned URL 열기
                </a>
              ) : (
                <span className="text-ash">등록된 에셋이 없습니다.</span>
              )}
            </td>
          </tr>
          <tr className="border-ash/20 border-b">
            <th scope="row" className="text-ash py-2 font-normal">
              export 모드
            </th>
            <td className="py-2">{asset?.glbExportMode ?? '—'}</td>
          </tr>
          <tr className="border-ash/20 border-b">
            <th scope="row" className="text-ash py-2 font-normal">
              재질 프리셋
            </th>
            <td className="py-2">{asset?.finish ?? '—'}</td>
          </tr>
          <tr className="border-ash/20 border-b">
            <th scope="row" className="text-ash py-2 font-normal">
              폴리곤 수
            </th>
            <td className="py-2 tabular-nums">
              {asset?.polygonCount == null ? '—' : asset.polygonCount.toLocaleString('ko-KR')}
            </td>
          </tr>
          <tr className="border-ash/20 border-b">
            <th scope="row" className="text-ash py-2 font-normal">
              검수 상태
            </th>
            <td className="py-2">
              {asset?.reviewStatus == null
                ? '—'
                : (ASSET_REVIEW_STATUS_LABEL[asset.reviewStatus] ?? asset.reviewStatus)}
              {asset?.reviewNote ? (
                <span className="text-ash block text-[13px]">사유: {asset.reviewNote}</span>
              ) : null}
            </td>
          </tr>
          <tr>
            <th scope="row" className="text-ash py-2 font-normal">
              리그 매니페스트
            </th>
            <td className="py-2 tabular-nums">
              {rigManifest
                ? `세그먼트 ${Object.keys(rigManifest.segments).length}개 · 관절 ${rigManifest.joints.length}개`
                : '없음 (관절 없는 에셋)'}
            </td>
          </tr>
        </tbody>
      </table>

      {initialRig !== null && initialRig.droppedJoints > 0 ? (
        <div className="mt-4">
          <InlineNotice
            variant="warning"
            message={`저장된 매니페스트에서 필수 값이 빠진 관절 ${initialRig.droppedJoints}개를 읽지 못했습니다. 이대로 저장하면 그 관절은 사라집니다 — 아래 저작 도구에서 다시 만들어 주세요.`}
          />
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-1.5">
        <label
          htmlFor="admin-asset-glb"
          className="text-ink border-ash/30 w-fit cursor-pointer rounded-[10px] border px-4 py-2.5 text-[15px] font-semibold"
        >
          {asset ? 'GLB 다시 올리기' : 'GLB 올리기'}
        </label>
        <input
          id="admin-asset-glb"
          type="file"
          accept=".glb,model/gltf-binary"
          disabled={isUploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
            // 같은 파일을 다시 골라도 change가 발화하도록 값을 비운다.
            event.target.value = '';
          }}
          className="sr-only"
        />
        <p className="text-ash text-[13px] leading-5">
          .glb 한 개만 올립니다. 올리는 즉시 스토리지에 저장되지만, 아래 [에셋 저장]을 눌러야 제품에
          연결됩니다.
          {asset
            ? ' 이미 등록된 에셋이면 재업로드 없이 아래 값(재질 프리셋·폴리곤 수·매니페스트)만 고쳐 저장할 수 있습니다.'
            : null}
          {isUploading ? ' 업로드 중…' : null}
          {uploadedFileName !== null && !isUploading ? ` 올린 파일: ${uploadedFileName}` : null}
        </p>
      </div>

      {uploadError !== null ? (
        <div className="mt-4">
          <InlineNotice variant="error" title="업로드 실패" message={uploadError} />
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
        <SelectField
          id="asset-glbExportMode"
          label="GLB export 모드"
          isRequired
          value={draft.glbExportMode}
          error={visibleErrors.glbExportMode}
          options={GLB_EXPORT_MODE_OPTIONS}
          onChange={handleExportModeChange}
          help="PART_SEGMENTATION = 파트별 분리 메쉬·텍스처 없음·관절 가능 / TEXTURE = 융합 메쉬 + PBR 텍스처. 한 GLB가 둘 다는 불가능합니다 — 관절이 필요하면 파트 분리로 뽑으세요."
        />
        <SelectField
          id="asset-finish"
          label="재질 프리셋"
          value={draft.finish}
          error={visibleErrors.finish}
          options={ASSET_FINISH_OPTIONS}
          isDisabled={!isPartSegmentation}
          onChange={(value) =>
            setDraft((prev) => ({ ...prev, finish: value as AssetDraft['finish'] }))
          }
          help="파트 분리 GLB에만 씁니다(텍스처를 못 받으므로 재질을 여기서 고릅니다). 색·거칠기·금속성 수치는 코드가 정본이고 여기선 프리셋 이름 하나만 고릅니다."
        />
        <NumberField
          id="asset-polygonCount"
          label="폴리곤 수"
          unit="개"
          value={draft.polygonCount}
          error={visibleErrors.polygonCount}
          onChange={(value) => setDraft((prev) => ({ ...prev, polygonCount: value }))}
          help="경량화 검수용 기록입니다. gltf-transform inspect가 찍어 준 삼각형 수를 정수로 넣고, 모르면 비웁니다."
        />
      </div>

      {draft.glbExportMode === 'TEXTURE' && rigManifest !== null ? (
        <div className="mt-5">
          <InlineNotice
            variant="warning"
            title="텍스처로 재export하면 관절을 잃습니다"
            message="텍스처 융합은 파트를 하나로 합쳐서 매니페스트가 가리킬 파트 이름이 사라집니다. 이 상태로 저장하면 저장돼 있던 리그 매니페스트가 비워집니다."
          />
        </div>
      ) : null}

      {hasAttemptedSubmit && !isValid ? (
        <div className="mt-5">
          <InlineNotice
            variant="error"
            message="입력하지 않았거나 형식이 맞지 않는 항목이 있습니다. 위에서 빨간 안내가 붙은 칸을 확인하세요."
          />
        </div>
      ) : null}

      {hasAttemptedSubmit && assetKey === null ? (
        <div className="mt-4">
          <InlineNotice variant="warning" message={NO_ASSET_KEY_REASON} />
        </div>
      ) : null}

      {submitError !== null ? (
        <div className="mt-4">
          <InlineNotice variant="error" title="에셋 저장 실패" message={submitError} />
        </div>
      ) : null}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting || isUploading}
          className="bg-highlight text-ink border-ash/20 hover:bg-ink hover:text-paper min-w-[140px] cursor-pointer rounded-[10px] border px-6 py-2.5 text-[16px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? '저장하는 중...' : '에셋 저장'}
        </button>
      </div>

      {isPartSegmentation ? (
        <div className="border-ash/20 mt-6 border-t pt-6">
          <h3 className="text-ink text-[17px] font-semibold">리그 매니페스트 저작</h3>
          <p className="text-ash mt-1 text-[13px] leading-5">
            모니터암·마이크암·노트북 거치대·휴대폰 거치대처럼 관절이 있는 제품만 필요합니다. 관절이
            없는 에셋은 이 자리를 비워 둔 채로 등록해도 됩니다.
          </p>

          {glbUrl === null ? (
            <p className="border-ash/30 text-ash mt-4 rounded-[10px] border border-dashed px-4 py-10 text-center text-[14px]">
              GLB를 먼저 올리면 파트 목록이 나타납니다.
            </p>
          ) : (
            <DynamicAssetRigAuthor
              glbUrl={glbUrl}
              sourceLabel={sourceLabel}
              initialManifest={initialRig?.manifest ?? null}
              saveBlockedReason={saveBlockedReason}
              onSave={handleSaveManifest}
            />
          )}
        </div>
      ) : null}
    </section>
  );
};

export default AssetSection;
