'use client';
// 제품 실사 이미지 — presign 발급 → 스토리지 직접 PUT → key 등록의 3단계를 N장 반복한다.
// 대표 1장은 product_image.is_primary가 정본이라 라디오 선택 즉시 서버에 반영한다.
// 삭제는 확인 창을 거친 DELETE 1회고, 대표가 남았는지는 삭제 후 재조회한 목록으로만 판단한다.

import { useState } from 'react';
import type { DragEvent } from 'react';

import {
  deleteProductImage,
  designatePrimaryProductImage,
  registerProductImage,
  requestProductImageUploadUrl,
} from '@/api/admin/products';
import { putToPresignedUrl } from '@/api/admin/uploads';
import MasterDialog from '@/components/admin/masters/MasterDialog';
import InlineNotice from '@/components/common/InlineNotice';
import RemoteImage from '@/components/common/RemoteImage';
import { MAX_PRODUCT_IMAGES } from '@/constants/admin/productForm';
import type { components } from '@/types/openapi';
import { IMAGE_FILE_ACCEPT, resolveImageContentType } from '@/utils/admin/imageContentType';
import { COMPRESSED_LONG_EDGE, prepareImageForUpload } from '@/utils/admin/imageCompression';

type ProductImageDetailResponse = components['schemas']['ProductImageDetailResponse'];

type Props = {
  productId: number;
  images: readonly ProductImageDetailResponse[];
  /** 업로드·대표 지정이 끝나면 상세를 다시 읽어 목록을 맞춘다. */
  onChanged: () => Promise<void>;
};

const ProductImageSection = ({ productId, images, onChanged }: Props) => {
  const [isBusy, setIsBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** 압축을 건너뛴 파일 안내. 오류가 아니라 사실 통지라 errorMessage와 분리한다. */
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  /** 삭제 확인 창에 걸린 이미지. null이면 창이 닫혀 있다. */
  const [pendingDelete, setPendingDelete] = useState<ProductImageDetailResponse | null>(null);
  /** 드롭 영역에 파일이 올라와 있는 동안의 하이라이트. */
  const [isDragOver, setIsDragOver] = useState(false);

  const remaining = MAX_PRODUCT_IMAGES - images.length;
  const hasPrimary = images.some((image) => image.isPrimary === true);
  const canUpload = !isBusy && remaining > 0;

  const uploadFiles = async (files: File[]) => {
    setIsBusy(true);
    setErrorMessage(null);
    setWarningMessage(null);

    try {
      let order = images.length;
      /** 압축하지 못해 원본으로 올라간 파일 — 끝나고 한 번에 알린다. */
      const uncompressed: string[] = [];

      for (const [index, file] of files.entries()) {
        setProgress(`${index + 1}/${files.length}장 압축 중… (${file.name})`);

        const sourceContentType = resolveImageContentType(file);
        if (sourceContentType === null) {
          throw new Error(`이미지 파일이 아닙니다: ${file.name}`);
        }

        // 원본을 스토리지에 넣지 않는다 — 긴 변 1280 상한 + webp로 다시 인코딩한다.
        // blob·contentType·fileName은 반드시 이 한 결과에서만 꺼내 쓴다: presign 요청과 PUT 헤더의
        // Content-Type이 갈리면 S3 서명 검증이 거절하고, fileName은 object key 확장자가 된다.
        const prepared = await prepareImageForUpload(file, sourceContentType);
        if (!prepared.isCompressed) uncompressed.push(file.name);

        setProgress(`${index + 1}/${files.length}장 업로드 중… (${file.name})`);
        const presigned = await requestProductImageUploadUrl(productId, {
          fileName: prepared.fileName,
          contentType: prepared.contentType,
        });
        if (!presigned.uploadUrl || !presigned.imageKey) {
          throw new Error('업로드 URL을 발급받지 못했습니다.');
        }

        await putToPresignedUrl(presigned.uploadUrl, prepared.blob, prepared.contentType);
        await registerProductImage(productId, {
          imageKey: presigned.imageKey,
          displayOrder: order,
          // 첫 장이 곧 대표다 — 대표가 없는 제품은 목록 카드가 폴백 아이콘을 쓴다.
          isPrimary: order === 0,
        });
        order += 1;
      }

      if (uncompressed.length > 0) {
        setWarningMessage(
          `다음 파일은 원본 그대로 올렸습니다: ${uncompressed.join(', ')} — GIF이거나 이미 충분히 작아 다시 인코딩해도 이득이 없는 경우입니다.`,
        );
      }

      await onChanged();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '이미지 업로드 중 오류가 발생했습니다.',
      );
    } finally {
      setProgress('');
      setIsBusy(false);
    }
  };

  const handleSelectFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const rejected = files.filter((file) => resolveImageContentType(file) === null);
    if (rejected.length > 0) {
      setErrorMessage(
        `이미지 파일만 올릴 수 있습니다. (PNG·JPG·WEBP·AVIF·GIF) 제외된 파일: ${rejected
          .map((file) => file.name)
          .join(', ')}`,
      );
      return;
    }
    if (files.length > remaining) {
      setErrorMessage(
        `이미지는 제품당 최대 ${MAX_PRODUCT_IMAGES}장입니다. ${remaining}장만 더 올릴 수 있습니다.`,
      );
      return;
    }
    void uploadFiles(files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    if (!canUpload) return;
    handleSelectFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    // preventDefault를 빼면 브라우저가 파일을 새 탭으로 열어 버린다.
    event.preventDefault();
    if (canUpload) setIsDragOver(true);
  };

  const handleDesignatePrimary = async (imageId: number) => {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await designatePrimaryProductImage(productId, imageId);
      await onChanged();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '대표 이미지 지정 중 오류가 발생했습니다.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (imageId: number) => {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      await deleteProductImage(productId, imageId);
      setPendingDelete(null);
      await onChanged();
    } catch (error) {
      setPendingDelete(null);
      setErrorMessage(
        error instanceof Error ? error.message : '이미지 삭제 중 오류가 발생했습니다.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="border-ash/20 mt-6 rounded-2xl border p-6">
      <h2 className="text-ink text-[19px] font-semibold">실사 이미지</h2>
      <p className="text-ash mt-1 text-[13px] leading-5">
        제품당 최대 {MAX_PRODUCT_IMAGES}장입니다. 카탈로그 제품은 최소 1장이 있어야 하며, 대표로
        고른 1장이 목록·카드에 쓰입니다. 3D 형상이 단순화된 제품의 실제 모습을 보완하는 것이
        목적입니다. 올린 이미지는 긴 변 {COMPRESSED_LONG_EDGE}px 상한으로 줄여 webp로 변환한 뒤
        저장합니다 — 원본을 그대로 두면 장당 수 MB가 되어 화면이 느려집니다.
      </p>

      <div
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`mt-4 flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 transition-colors ${
          isDragOver ? 'border-primary-500 bg-primary-50' : 'border-ash/30'
        }`}
      >
        <label
          htmlFor="product-image-files"
          className="text-ink border-ash/30 w-fit cursor-pointer rounded-[10px] border px-4 py-2.5 text-[15px] font-semibold"
        >
          이미지 추가
        </label>
        <input
          id="product-image-files"
          type="file"
          accept={IMAGE_FILE_ACCEPT}
          multiple
          disabled={!canUpload}
          onChange={(event) => {
            handleSelectFiles(event.target.files);
            // 같은 파일을 다시 골라도 change가 발화하도록 값을 비운다.
            event.target.value = '';
          }}
          className="sr-only"
        />
        <p className="text-ash text-center text-[13px] leading-5">
          {remaining > 0
            ? `여기로 끌어다 놓아도 됩니다. 여러 장을 한 번에 고를 수 있습니다. ${remaining}장 더 올릴 수 있습니다.`
            : `상한 ${MAX_PRODUCT_IMAGES}장을 채웠습니다. 더 올리려면 아래 목록에서 [삭제]로 기존 이미지를 지우세요.`}
        </p>
        {progress ? <p className="text-ash text-[13px]">{progress}</p> : null}
      </div>

      {errorMessage ? (
        <div className="mt-4">
          <InlineNotice variant="error" message={errorMessage} />
        </div>
      ) : null}

      {warningMessage ? (
        <div className="mt-4">
          <InlineNotice variant="warning" message={warningMessage} />
        </div>
      ) : null}

      {images.length > 0 && !hasPrimary ? (
        <div className="mt-4">
          <InlineNotice
            variant="warning"
            message="대표 이미지가 없습니다. 목록·카드가 폴백 아이콘을 쓰게 되니 아래에서 대표를 하나 지정하세요."
          />
        </div>
      ) : null}

      {images.length === 0 ? (
        <p className="border-ash/30 text-ash mt-4 rounded-[10px] border border-dashed px-4 py-8 text-center text-[14px]">
          아직 등록된 이미지가 없습니다.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-4 gap-4">
          {images.map((image, index) => (
            <li key={image.imageId} className="flex flex-col gap-2">
              <div className="bg-fog/50 aspect-square overflow-hidden rounded-xl">
                {image.imageUrl ? (
                  <RemoteImage
                    src={image.imageUrl}
                    alt={`제품 실사 이미지 ${index + 1}`}
                    width={200}
                    height={200}
                    sizes="200px"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-ink flex cursor-pointer items-center gap-1.5 text-[14px]">
                  <input
                    type="radio"
                    name="product-primary-image"
                    checked={image.isPrimary === true}
                    disabled={isBusy || image.imageId == null}
                    onChange={() => {
                      if (image.imageId != null) {
                        void handleDesignatePrimary(image.imageId);
                      }
                    }}
                    className="accent-primary-500 size-4 cursor-pointer"
                  />
                  대표
                </label>
                <button
                  type="button"
                  disabled={isBusy || image.imageId == null}
                  onClick={() => setPendingDelete(image)}
                  className="border-danger-500/40 text-danger-700 hover:bg-danger-50 cursor-pointer rounded-[8px] border px-2 py-1 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete !== null ? (
        <MasterDialog
          title="이미지를 삭제하시겠습니까?"
          role="alertdialog"
          isBusy={isBusy}
          onClose={() => setPendingDelete(null)}
        >
          <p className="text-ink text-[15px] leading-6">
            이 실사 이미지를 제품에서 삭제합니다. 되돌릴 수 없습니다.
          </p>

          {pendingDelete.isPrimary === true ? (
            <div className="mt-4">
              <InlineNotice
                variant="warning"
                message="대표 이미지입니다. 지우면 이 제품에 대표가 없어져 목록·카드가 폴백 아이콘을 씁니다 — 삭제한 뒤 남은 이미지 중에서 새 대표를 지정하세요."
              />
            </div>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              autoFocus
              disabled={isBusy}
              onClick={() => setPendingDelete(null)}
              className="border-ash/30 text-ink hover:bg-fog cursor-pointer rounded-[10px] border px-3 py-1.5 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                if (pendingDelete.imageId != null) {
                  void handleDelete(pendingDelete.imageId);
                }
              }}
              className="border-danger-500/40 text-danger-700 hover:bg-danger-50 cursor-pointer rounded-[10px] border px-3 py-1.5 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBusy ? '삭제 중' : '삭제'}
            </button>
          </div>
        </MasterDialog>
      ) : null}
    </section>
  );
};

export default ProductImageSection;
