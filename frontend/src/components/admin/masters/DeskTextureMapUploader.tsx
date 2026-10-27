// 상판 재질 텍스처 맵 3종(알베도·러프니스·노멀) 2단계 업로드 —
// map-upload-urls 발급 → 스토리지에 직접 PUT → PATCH albedoKey·roughnessKey·normalKey.
// 재질 id가 있어야 발급을 받으므로 등록 폼이 아니라 수정 모달에만 있다.

'use client';

import { useState } from 'react';
import type { ChangeEvent } from 'react';

import {
  requestDeskTextureMapUploadUrls,
  updateDeskTexture,
  type DeskTextureMapKind,
  type DeskTexturePatchRequest,
  type DeskTextureResponse,
} from '@/api/admin/masters';
import { putToPresignedUrl } from '@/api/admin/uploads';
import { toMasterErrorMessage } from '@/components/admin/masters/masterErrors';
import InlineNotice from '@/components/common/InlineNotice';

/** 서버가 맵 key를 항상 .ktx2로 만들고 Content-Type도 image/ktx2로 서명한다(AdminDeskTextureService). */
const MAP_CONTENT_TYPE = 'image/ktx2';
const MAP_EXTENSION = '.ktx2';

interface MapSlot {
  kind: DeskTextureMapKind;
  label: string;
  help: string;
  /** PATCH로 보낼 필드명 — 맵 종류마다 컬럼이 따로 있다(erd.md desk_texture) */
  patchField: 'albedoKey' | 'roughnessKey' | 'normalKey';
}

const MAP_SLOTS: readonly MapSlot[] = [
  {
    kind: 'ALBEDO',
    label: '알베도(색) 맵',
    help: '재질의 색 텍스처입니다. gltfpack으로 만든 .ktx2 파일만 올릴 수 있습니다.',
    patchField: 'albedoKey',
  },
  {
    kind: 'ROUGHNESS',
    label: '러프니스 맵',
    help: '표면 거칠기 텍스처입니다. 올리지 않으면 아래 러프니스 숫자값이 그대로 쓰입니다.',
    patchField: 'roughnessKey',
  },
  {
    kind: 'NORMAL',
    label: '노멀 맵',
    help: '요철 표현 텍스처입니다. 파일 손실이 가장 큰 맵이라 알베도의 절반 해상도로 만듭니다.',
    patchField: 'normalKey',
  },
] as const;

type Props = {
  deskTextureId: number;
  deskTexture: DeskTextureResponse;
  /** 업로드와 key 등록이 끝났을 때 목록을 다시 읽게 알린다 */
  onUploaded: () => void;
};

const DeskTextureMapUploader = ({ deskTextureId, deskTexture, onUploaded }: Props) => {
  const [uploadingKind, setUploadingKind] = useState<DeskTextureMapKind | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadedKeys, setUploadedKeys] = useState<Partial<Record<string, string>>>({});

  const handleChange = async (slot: MapSlot, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 같은 파일을 다시 골라도 change가 나게 값을 비운다
    event.target.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(MAP_EXTENSION)) {
      setErrorMessage(`${slot.label}은 .ktx2 파일만 올릴 수 있습니다.`);
      return;
    }

    setErrorMessage(null);
    setUploadingKind(slot.kind);
    try {
      const presigned = await requestDeskTextureMapUploadUrls(deskTextureId, {
        kinds: [slot.kind],
      });
      const target = presigned.maps?.find((map) => map.kind === slot.kind);
      if (!target?.uploadUrl || !target.key) {
        setErrorMessage('업로드 주소를 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      // PUT의 Content-Type은 서버가 서명할 때 쓴 값과 반드시 같아야 한다(서명 불일치 방지).
      await putToPresignedUrl(target.uploadUrl, file, MAP_CONTENT_TYPE);
      const patch: DeskTexturePatchRequest = { [slot.patchField]: target.key };
      await updateDeskTexture(deskTextureId, patch);

      setUploadedKeys((keys) => ({ ...keys, [slot.patchField]: target.key }));
      onUploaded();
    } catch (error: unknown) {
      setErrorMessage(toMasterErrorMessage(error, `${slot.label}을 올리지 못했습니다.`));
    } finally {
      setUploadingKind(null);
    }
  };

  return (
    <div className="border-ash/20 flex flex-col gap-4 rounded-[10px] border p-4">
      <div>
        <p className="text-ink text-[14px] font-semibold">텍스처 맵 (KTX2)</p>
        <p className="text-ash mt-1 text-[13px] leading-5">
          도장 상판은 결이 없습니다 — 블랙·화이트 같은 단색 재질은 맵을 하나도 올리지 않고 기본
          색(base color)만 두면 됩니다. 파일을 고르면 즉시 업로드되고 재질에 바로 반영됩니다.
        </p>
      </div>

      {MAP_SLOTS.map((slot) => {
        const storedKey = uploadedKeys[slot.patchField] ?? deskTexture[slot.patchField];

        return (
          <label key={slot.kind} className="flex flex-col gap-1.5">
            <span className="text-ink text-[14px] font-medium">
              {slot.label}
              <span className="text-ash font-normal"> (선택)</span>
            </span>
            <input
              type="file"
              accept=".ktx2"
              disabled={uploadingKind !== null}
              onChange={(event) => {
                void handleChange(slot, event);
              }}
              className="text-ink file:border-ash/30 file:text-ink text-[13px] file:mr-3 file:cursor-pointer file:rounded-[10px] file:border file:bg-white file:px-3 file:py-1.5 file:text-[14px]"
            />
            <span className="text-ash text-[13px] leading-5">{slot.help}</span>
            {storedKey ? (
              <span className="text-ash text-[12px] break-all">저장된 키: {storedKey}</span>
            ) : (
              <span className="text-ash text-[12px]">아직 없음 (단색 재질이면 정상입니다)</span>
            )}
            {uploadingKind === slot.kind ? (
              <span className="text-ash text-[13px]">올리는 중…</span>
            ) : null}
          </label>
        );
      })}

      {errorMessage ? <InlineNotice variant="error" message={errorMessage} /> : null}
    </div>
  );
};

export default DeskTextureMapUploader;
