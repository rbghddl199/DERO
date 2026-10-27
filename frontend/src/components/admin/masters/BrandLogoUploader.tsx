// 브랜드 로고 2단계 업로드 — presign(upload-url) → 스토리지에 직접 PUT → PATCH logoImageKey.
// 브랜드 id가 있어야 presign을 받으므로 등록 폼이 아니라 수정 모달에만 있다.

'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';

import { requestBrandLogoUploadUrl, updateBrand } from '@/api/admin/masters';
import { putToPresignedUrl } from '@/api/admin/uploads';
import { toMasterErrorMessage } from '@/components/admin/masters/masterErrors';
import InlineNotice from '@/components/common/InlineNotice';
import { prepareImageForUpload } from '@/utils/admin/imageCompression';
import { IMAGE_FILE_ACCEPT, resolveImageContentType } from '@/utils/admin/imageContentType';

type Props = {
  brandId: number;
  /** 이미 등록돼 있는 object key(없으면 아직 안 올린 브랜드) */
  currentLogoImageKey: string | null;
  /** 업로드와 key 등록이 모두 끝났을 때 새 key를 알린다 */
  onUploaded: (logoImageKey: string) => void;
};

const BrandLogoUploader = ({ brandId, currentLogoImageKey, onUploaded }: Props) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadedKey, setUploadedKey] = useState<string | null>(null);

  // 미리보기는 방금 고른 파일의 blob URL이다 — object key로 이미지를 읽는 공개 경로가 아직 없다.
  useEffect(() => {
    if (previewUrl === null) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    // 같은 파일을 다시 골라도 change가 나게 값을 비운다
    event.target.value = '';
    if (!file) return;

    // File.type이 빈 문자열로 오는 환경이 있어 확장자로 메운다 — 그대로 보내면 백엔드가 400을 낸다.
    const contentType = resolveImageContentType(file);
    if (contentType === null) {
      setErrorMessage('이미지 파일만 올릴 수 있습니다. (PNG·JPG·WEBP 등)');
      return;
    }

    setErrorMessage(null);
    setIsUploading(true);
    try {
      // 서버 MIME표가 webp만 받는다(ADR-0035) — presign 요청 전에 브라우저에서 변환한다.
      const prepared = await prepareImageForUpload(file, contentType);
      const presigned = await requestBrandLogoUploadUrl(brandId, {
        fileName: prepared.fileName,
        contentType: prepared.contentType,
      });
      if (!presigned.uploadUrl || !presigned.logoKey) {
        setErrorMessage('업로드 주소를 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      // PUT의 Content-Type은 presign을 요청할 때 보낸 값과 반드시 같아야 한다(서명 불일치 방지).
      await putToPresignedUrl(presigned.uploadUrl, prepared.blob, prepared.contentType);
      await updateBrand(brandId, { logoImageKey: presigned.logoKey });

      setPreviewUrl(URL.createObjectURL(file));
      setUploadedKey(presigned.logoKey);
      onUploaded(presigned.logoKey);
    } catch (error: unknown) {
      setErrorMessage(toMasterErrorMessage(error, '로고를 올리지 못했습니다.'));
    } finally {
      setIsUploading(false);
    }
  };

  const storedKey = uploadedKey ?? currentLogoImageKey;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ink text-[14px] font-semibold">
        로고 이미지<span className="text-ash font-normal"> (선택)</span>
      </span>

      <div className="flex items-center gap-3">
        <div className="border-ash/40 bg-fog flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border">
          {previewUrl ? (
            // 방금 올린 파일의 로컬 미리보기 — next/image는 blob: URL을 최적화하지 못한다
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="선택한 로고 미리보기"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-ash text-[11px]">{storedKey ? '등록됨' : '없음'}</span>
          )}
        </div>

        <input
          type="file"
          accept={IMAGE_FILE_ACCEPT}
          disabled={isUploading}
          onChange={(event) => {
            void handleChange(event);
          }}
          className="text-ink file:border-ash/30 file:text-ink text-[13px] file:mr-3 file:cursor-pointer file:rounded-[10px] file:border file:bg-white file:px-3 file:py-1.5 file:text-[14px]"
        />
      </div>

      <span className="text-ash text-[13px] leading-5">
        이미지 파일만 올릴 수 있습니다. 고르는 즉시 업로드되고 브랜드에 바로 반영됩니다 — 저장
        버튼을 따로 누르지 않아도 됩니다.
      </span>
      {storedKey ? (
        <span className="text-ash text-[12px] break-all">저장된 키: {storedKey}</span>
      ) : null}
      {isUploading ? <span className="text-ash text-[13px]">올리는 중…</span> : null}
      {errorMessage ? <InlineNotice variant="error" message={errorMessage} /> : null}
    </div>
  );
};

export default BrandLogoUploader;
