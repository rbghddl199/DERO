// 제품 공통 필드 — erd.md `product` 테이블. 카탈로그 제품은 브랜드·가격·구매처가 필수고,
// 규격 타입은 등록 뒤 바꿀 수 없다(배치·장바구니가 규격 서브타입을 참조한다).

import { SPEC_TYPE_OPTIONS, STATUS_OPTIONS } from '@/constants/admin/productForm';
import type { CommonDraft, FieldErrors, SelectOption } from '@/types/admin/productForm';
import {
  FormSection,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from './ProductFormFields';

type Props = {
  draft: CommonDraft;
  errors: FieldErrors;
  brandOptions: readonly SelectOption[];
  categoryOptions: readonly SelectOption[];
  isEditMode: boolean;
  onChange: (patch: Partial<CommonDraft>) => void;
};

const KEEP_BLANK_HELP =
  '빈칸으로 두면 지금 값이 그대로 유지됩니다. 값을 비우는(NULL) 수정은 없습니다.';

const ProductCommonFields = ({
  draft,
  errors,
  brandOptions,
  categoryOptions,
  isEditMode,
  onChange,
}: Props) => (
  <FormSection
    title="공통 정보"
    description="브랜드·가격·구매처는 운영진이 등록하는 카탈로그 제품(source = CATALOG)의 필수 3종입니다."
  >
    <SelectField
      id="common-specType"
      label="규격 타입"
      isRequired
      value={draft.specType}
      error={errors.specType}
      options={SPEC_TYPE_OPTIONS}
      isDisabled={isEditMode}
      onChange={(value) => onChange({ specType: value as CommonDraft['specType'] })}
      help={
        isEditMode
          ? '규격 타입은 변경 불가입니다. 바꾸면 배치·장바구니 참조가 끊깁니다.'
          : '이 제품의 규격이 어느 표에 저장될지 정합니다. 등록 뒤에는 바꿀 수 없으니 지금 정확히 고르세요.'
      }
    />
    <TextField
      id="common-name"
      label="제품명"
      isRequired={!isEditMode}
      value={draft.name}
      error={errors.name}
      onChange={(value) => onChange({ name: value })}
      placeholder="예) 데스커 1400 원목 데스크"
      help={isEditMode ? KEEP_BLANK_HELP : '카탈로그에 노출되는 이름입니다. 200자까지 들어갑니다.'}
    />
    <SelectField
      id="common-brandId"
      label="브랜드"
      isRequired={!isEditMode}
      value={draft.brandId}
      error={errors.brandId}
      options={brandOptions}
      onChange={(value) => onChange({ brandId: value })}
      help="카탈로그 제품은 필수입니다. 목록에 없으면 관리자 콘솔의 '브랜드'에서 먼저 등록하세요."
    />
    <SelectField
      id="common-categoryId"
      label="카테고리"
      isRequired={!isEditMode}
      value={draft.categoryId}
      error={errors.categoryId}
      options={categoryOptions}
      onChange={(value) => onChange({ categoryId: value })}
      help="탐색용 분류 트리입니다. 규격 타입과는 별개 축이라 카테고리를 늘려도 규격은 그대로입니다."
    />
    <NumberField
      id="common-priceKrw"
      label="가격"
      unit="원"
      isRequired={!isEditMode}
      value={draft.priceKrw}
      error={errors.priceKrw}
      onChange={(value) => onChange({ priceKrw: value })}
      help="원화 정가를 정수로 넣습니다(쉼표 없이). 카탈로그 제품은 필수이며 견적 합산에 쓰입니다."
    />
    <TextField
      id="common-productUrl"
      label="구매처 링크"
      isRequired={!isEditMode}
      value={draft.productUrl}
      error={errors.productUrl}
      onChange={(value) => onChange({ productUrl: value })}
      placeholder="https://"
      help="제품을 살 수 있는 페이지 주소입니다. 카탈로그 제품은 필수입니다."
    />
    {isEditMode ? (
      <SelectField
        id="common-status"
        label="노출 상태"
        isRequired
        value={draft.status}
        error={errors.status}
        options={STATUS_OPTIONS}
        placeholder="선택하세요"
        onChange={(value) => onChange({ status: value as CommonDraft['status'] })}
        help="내리면(HIDDEN) 카탈로그에서 숨겨집니다. 3D 에셋 검수 상태와는 다른 축이라 검수를 통과해도 여기서 내리면 안 보입니다."
      />
    ) : null}
    <div className="col-span-2">
      <TextAreaField
        id="common-description"
        label="설명"
        value={draft.description}
        error={errors.description}
        onChange={(value) => onChange({ description: value })}
        help={
          isEditMode ? KEEP_BLANK_HELP : '제품 상세에 보이는 소개 문구입니다. 비워 둘 수 있습니다.'
        }
      />
    </div>
  </FormSection>
);

export default ProductCommonFields;
