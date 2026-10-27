// VESA 태깅 입력 — erd.md `product_vesa`(제품 ↔ VESA 규격 다대다). 모니터·모니터암만 값을
// 가질 수 있어 규격 서브타입이 아니라 공통 초안에 들어간다.

import type { SelectOption } from '@/types/admin/productForm';
import { CheckboxGroupField, FormSection } from './ProductFormFields';

type Props = {
  value: readonly string[];
  vesaSpecOptions: readonly SelectOption[];
  onChange: (value: string[]) => void;
};

const ProductVesaFields = ({ value, vesaSpecOptions, onChange }: Props) => (
  <FormSection
    title="VESA 규격"
    description="모니터암 호환 판정이 이 값을 그대로 씁니다 — 3D 메쉬가 아니라 mm 값이 정본입니다."
  >
    <CheckboxGroupField
      id="common-vesaSpecIds"
      label="지원 VESA 규격"
      value={value}
      options={vesaSpecOptions}
      onChange={onChange}
      help="모니터는 뒷면 홀 간격, 모니터암은 물릴 수 있는 홀 간격입니다. 여러 개를 고를 수 있습니다. 목록에 없으면 관리자 콘솔의 'VESA 규격'에서 먼저 등록하세요."
    />
  </FormSection>
);

export default ProductVesaFields;
