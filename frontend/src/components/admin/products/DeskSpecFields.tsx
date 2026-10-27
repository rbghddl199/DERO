// 책상(DESK) 규격 입력 — erd.md §3 `desk` 전 컬럼. 판정 ①은 상판·엣지 중 두꺼운 쪽을 본다.

import { FRAME_TYPE_OPTIONS } from '@/constants/admin/productForm';
import type { DeskSpecDraft, FieldErrors, SelectOption } from '@/types/admin/productForm';
import { BooleanField, FormSection, NumberField, SelectField } from './ProductFormFields';

type Props = {
  draft: DeskSpecDraft;
  errors: FieldErrors;
  deskTextureOptions: readonly SelectOption[];
  onChange: (patch: Partial<DeskSpecDraft>) => void;
};

const DeskSpecFields = ({ draft, errors, deskTextureOptions, onChange }: Props) => (
  <FormSection
    title="책상 규격"
    description="전부 실측 mm 정수입니다. 카탈로그 표기와 다르면 실측값이 정본입니다."
  >
    <NumberField
      id="desk-widthMm"
      label="상판 가로"
      unit="mm"
      isRequired
      value={draft.widthMm}
      error={errors.widthMm}
      onChange={(value) => onChange({ widthMm: value })}
      help="상판의 좌우 폭. mm 정수로 입력합니다. (예: 1400)"
    />
    <NumberField
      id="desk-depthMm"
      label="상판 깊이"
      unit="mm"
      isRequired
      value={draft.depthMm}
      error={errors.depthMm}
      onChange={(value) => onChange({ depthMm: value })}
      help="상판의 앞뒤 깊이. mm 정수로 입력합니다. (예: 700)"
    />
    <NumberField
      id="desk-heightMm"
      label="높이"
      unit="mm"
      isRequired
      value={draft.heightMm}
      error={errors.heightMm}
      onChange={(value) => onChange({ heightMm: value })}
      help="바닥에서 상판 윗면까지의 높이입니다. 상판 두께를 포함한 값입니다."
    />
    <NumberField
      id="desk-topThicknessMm"
      label="상판 두께"
      unit="mm"
      isRequired
      value={draft.topThicknessMm}
      error={errors.topThicknessMm}
      onChange={(value) => onChange({ topThicknessMm: value })}
      help="상판 자체의 두께. 모니터암 클램프 물림 판정의 입력 중 하나입니다."
    />
    <NumberField
      id="desk-edgeThicknessMm"
      label="엣지 두께"
      unit="mm"
      isRequired
      value={draft.edgeThicknessMm}
      error={errors.edgeThicknessMm}
      onChange={(value) => onChange({ edgeThicknessMm: value })}
      help="밴딩·몰딩을 포함한 가장자리 최대 두께. 클램프 판정은 상판과 엣지 중 두꺼운 쪽을 봅니다. 엣지 마감이 평범하면 상판 두께와 같은 값을 넣으세요."
    />
    <SelectField
      id="desk-deskTextureId"
      label="상판 재질"
      isRequired
      value={draft.deskTextureId}
      error={errors.deskTextureId}
      options={deskTextureOptions}
      onChange={(value) => onChange({ deskTextureId: value })}
      help="이 제품이 실제로 파는 상판 재질입니다. 목록에 없으면 관리자 콘솔의 '책상 재질'에서 먼저 등록하세요."
    />
    <SelectField
      id="desk-frameType"
      label="프레임 형태"
      isRequired
      value={draft.frameType}
      error={errors.frameType}
      options={FRAME_TYPE_OPTIONS}
      onChange={(value) => onChange({ frameType: value as DeskSpecDraft['frameType'] })}
      help="다리 구조입니다. 상판만 파는 제품은 TOP_ONLY를 고릅니다."
    />
    <BooleanField
      id="desk-isRounded"
      label="모서리 라운드"
      value={draft.isRounded}
      error={errors.isRounded}
      onChange={(value) => onChange({ isRounded: value })}
      help="상판 모서리가 둥글게 가공됐는지 여부입니다. 제품 사진으로 판단할 수 있으며, 미선택 상태로는 저장할 수 없습니다."
    />
    <NumberField
      id="desk-allowedLoadG"
      label="상판 허용 하중"
      unit="g"
      value={draft.allowedLoadG}
      error={errors.allowedLoadG}
      onChange={(value) => onChange({ allowedLoadG: value })}
      help="그램 정수입니다(80kg = 80000). 호환성 판정에는 쓰이지 않는 참고값이라 모르면 비웁니다."
    />
  </FormSection>
);

export default DeskSpecFields;
