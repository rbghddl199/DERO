// 조명(LIGHT) 규격 입력 — erd.md §3 `light` 전 컬럼. 광학 값은 카탈로그 표기용 마커라
// 모르면 비운다(렌더가 쓰는 밝기·도달·배광은 발광 설정 `product_emitter`가 정본).

import { DISTRIBUTION_OPTIONS } from '@/constants/admin/productForm';
import type { FieldErrors, LightSpecDraft } from '@/types/admin/productForm';
import { BooleanField, FormSection, NumberField, SelectField } from './ProductFormFields';

type Props = {
  draft: LightSpecDraft;
  errors: FieldErrors;
  onChange: (patch: Partial<LightSpecDraft>) => void;
};

const LightSpecFields = ({ draft, errors, onChange }: Props) => (
  <FormSection
    title="조명 규격"
    description="크기 3종만 필수입니다. 아래 광학 값은 제품 상세에 표기되는 카탈로그 사양이라 스펙시트에 없으면 비우세요 — 지어내지 않습니다."
  >
    <NumberField
      id="light-widthMm"
      label="가로"
      unit="mm"
      isRequired
      value={draft.widthMm}
      error={errors.widthMm}
      onChange={(value) => onChange({ widthMm: value })}
      help="바닥 면적 판정의 입력이라 반드시 실측값을 넣습니다."
    />
    <NumberField
      id="light-depthMm"
      label="깊이"
      unit="mm"
      isRequired
      value={draft.depthMm}
      error={errors.depthMm}
      onChange={(value) => onChange({ depthMm: value })}
      help="앞뒤 깊이입니다. 결측이면 소품↔책상 판정이 돌지 않습니다."
    />
    <NumberField
      id="light-heightMm"
      label="높이"
      unit="mm"
      isRequired
      value={draft.heightMm}
      error={errors.heightMm}
      onChange={(value) => onChange({ heightMm: value })}
      help="바닥에서 가장 높은 지점까지입니다."
    />
    <BooleanField
      id="light-isColorTemperatureAdjustable"
      label="색온도 조절 가능"
      value={draft.isColorTemperatureAdjustable}
      error={errors.isColorTemperatureAdjustable}
      onChange={(value) => onChange({ isColorTemperatureAdjustable: value })}
      help="색온도 조절 손잡이·버튼이 있는지 여부입니다. 제품 사진·상세페이지로 판단할 수 있어 미선택은 저장할 수 없습니다."
    />
    <BooleanField
      id="light-isBrightnessAdjustable"
      label="밝기 조절 가능"
      value={draft.isBrightnessAdjustable}
      error={errors.isBrightnessAdjustable}
      onChange={(value) => onChange({ isBrightnessAdjustable: value })}
      help="밝기 조절 손잡이·버튼이 있는지 여부입니다."
    />
    <NumberField
      id="light-colorTemperatureMinK"
      label="색온도 최소"
      unit="K"
      value={draft.colorTemperatureMinK}
      error={errors.colorTemperatureMinK}
      onChange={(value) => onChange({ colorTemperatureMinK: value })}
      help="켈빈 정수입니다(3000K = 3000). 조절이 안 되는 제품은 고정값을 최소·최대에 같이 넣고, 표기가 없으면 둘 다 비웁니다."
    />
    <NumberField
      id="light-colorTemperatureMaxK"
      label="색온도 최대"
      unit="K"
      value={draft.colorTemperatureMaxK}
      error={errors.colorTemperatureMaxK}
      onChange={(value) => onChange({ colorTemperatureMaxK: value })}
      help="조절 범위의 위쪽 값입니다. (예: 6500)"
    />
    <NumberField
      id="light-luminousFluxMinLm"
      label="정격 광속 최소"
      unit="lm"
      value={draft.luminousFluxMinLm}
      error={errors.luminousFluxMinLm}
      onChange={(value) => onChange({ luminousFluxMinLm: value })}
      help="제조사 표기 루멘입니다. 3D 렌더는 이 값을 읽지 않습니다 — 모르면 비웁니다."
    />
    <NumberField
      id="light-luminousFluxMaxLm"
      label="정격 광속 최대"
      unit="lm"
      value={draft.luminousFluxMaxLm}
      error={errors.luminousFluxMaxLm}
      onChange={(value) => onChange({ luminousFluxMaxLm: value })}
      help="조절이 안 되는 제품은 최소와 같은 값을 넣습니다."
    />
    <SelectField
      id="light-distribution"
      label="배광"
      value={draft.distribution}
      error={errors.distribution}
      options={DISTRIBUTION_OPTIONS}
      onChange={(value) => onChange({ distribution: value as LightSpecDraft['distribution'] })}
      help="빛이 퍼지는 형태의 카탈로그 표기입니다. 렌더가 읽는 배광은 발광 설정 쪽에서 따로 정합니다."
    />
    <NumberField
      id="light-reachMm"
      label="정격 도달 거리"
      unit="mm"
      value={draft.reachMm}
      error={errors.reachMm}
      onChange={(value) => onChange({ reachMm: value })}
      help="제조사가 표기한 도달 거리입니다. 렌더의 도달 반경과는 다른 값입니다."
    />
  </FormSection>
);

export default LightSpecFields;
