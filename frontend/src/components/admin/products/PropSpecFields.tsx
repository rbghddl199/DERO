// 소품(PROP) 규격 입력 — erd.md §3 `prop` 전 컬럼. 노트북·휴대폰 거치대도 여기에 들어간다.

import { MOUNT_SURFACE_OPTIONS } from '@/constants/admin/productForm';
import type { FieldErrors, PropSpecDraft } from '@/types/admin/productForm';
import { BooleanField, FormSection, NumberField, SelectField } from './ProductFormFields';

type Props = {
  draft: PropSpecDraft;
  errors: FieldErrors;
  onChange: (patch: Partial<PropSpecDraft>) => void;
};

const PropSpecFields = ({ draft, errors, onChange }: Props) => (
  <FormSection
    title="소품 규격"
    description="관절이 있는 거치대도 각도 컬럼이 없습니다 — 관절 한계는 3D 에셋 매니페스트가 정합니다."
  >
    <NumberField
      id="prop-widthMm"
      label="가로"
      unit="mm"
      isRequired
      value={draft.widthMm}
      error={errors.widthMm}
      onChange={(value) => onChange({ widthMm: value })}
      help="mm 정수로 입력합니다. 실측값이 카탈로그 표기보다 우선입니다."
    />
    <NumberField
      id="prop-depthMm"
      label="깊이"
      unit="mm"
      isRequired
      value={draft.depthMm}
      error={errors.depthMm}
      onChange={(value) => onChange({ depthMm: value })}
      help="앞뒤 깊이입니다. 상판 면적·충돌 판정의 입력입니다."
    />
    <NumberField
      id="prop-heightMm"
      label="높이"
      unit="mm"
      isRequired
      value={draft.heightMm}
      error={errors.heightMm}
      onChange={(value) => onChange({ heightMm: value })}
      help="바닥에서 가장 높은 지점까지입니다."
    />
    <NumberField
      id="prop-weightG"
      label="무게"
      unit="g"
      value={draft.weightG}
      error={errors.weightG}
      onChange={(value) => onChange({ weightG: value })}
      help="그램 정수입니다(1.2kg = 1200). 모르면 비웁니다."
    />
    <SelectField
      id="prop-mountSurface"
      label="놓을 수 있는 표면"
      isRequired
      value={draft.mountSurface}
      error={errors.mountSurface}
      options={MOUNT_SURFACE_OPTIONS}
      onChange={(value) => onChange({ mountSurface: value as PropSpecDraft['mountSurface'] })}
      help="이 제품이 실제로 놓이는 자리 하나를 고릅니다. 벽걸이 선반이면 WALL, 타공판 부착물이면 PEGBOARD입니다 — 벽을 끈 면에는 배치가 막힙니다."
    />
    <BooleanField
      id="prop-isStackable"
      label="위에 다른 물건을 얹을 수 있음"
      value={draft.isStackable}
      error={errors.isStackable}
      onChange={(value) => onChange({ isStackable: value })}
      help="모니터 받침대처럼 위에 다른 아이템을 쌓을 수 있으면 예입니다. 스태킹 스냅이 이 값으로 갈립니다."
    />
  </FormSection>
);

export default PropSpecFields;
