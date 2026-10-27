// 모니터암·마이크암(ARM) 규격 입력 — erd.md §3 `arm` 전 컬럼. WAS 검증 규칙 2건을 화면에서
// 먼저 잠근다: 마이크암이면 피벗·VESA 플레이트가 없고, 자립형이면 마운트 3종이 전부 아니오다.

import { ARM_KIND_OPTIONS, ARM_TYPE_OPTIONS } from '@/constants/admin/productForm';
import type { ArmSpecDraft, FieldErrors } from '@/types/admin/productForm';
import { BooleanField, FormSection, NumberField, SelectField } from './ProductFormFields';

type Props = {
  draft: ArmSpecDraft;
  errors: FieldErrors;
  onChange: (patch: Partial<ArmSpecDraft>) => void;
};

const ArmSpecFields = ({ draft, errors, onChange }: Props) => {
  const isMic = draft.armKind === 'MIC';
  const isStand = draft.armType === 'STAND';

  return (
    <FormSection
      title="암 규격"
      description="거치 대상(모니터암·마이크암)과 구조 분류는 서로 독립입니다 — 마이크암에도 폴형·다관절·자립형이 다 있습니다."
    >
      <SelectField
        id="arm-armKind"
        label="거치 대상"
        isRequired
        value={draft.armKind}
        error={errors.armKind}
        options={ARM_KIND_OPTIONS}
        onChange={(value) =>
          onChange({
            armKind: value as ArmSpecDraft['armKind'],
            // 마이크암엔 화면 피벗·VESA 플레이트 개념이 없어 입력을 비운다(서버가 NULL·false로 강제).
            ...(value === 'MIC' ? { pivotRangeDeg: '', isVesaPlateDetachable: 'no' as const } : {}),
          })
        }
        help="무엇을 거치하는 제품인지 고릅니다. 마이크암을 고르면 피벗·VESA 플레이트 입력이 잠깁니다."
      />
      <SelectField
        id="arm-armType"
        label="구조 분류"
        isRequired
        value={draft.armType}
        error={errors.armType}
        options={ARM_TYPE_OPTIONS}
        onChange={(value) =>
          onChange({
            armType: value as ArmSpecDraft['armType'],
            // 자립형은 책상·벽에 고정하지 않는다 — 마운트 3종을 아니오로 내린다.
            ...(value === 'STAND'
              ? {
                  isClampMountable: 'no' as const,
                  isGrommetMountable: 'no' as const,
                  isWallMountable: 'no' as const,
                }
              : {}),
          })
        }
        help="폴형(기둥)·다관절·자립형(무게추 스탠드) 중 구조를 고릅니다. 고정 방식이 아니라 형태 분류입니다."
      />
      <NumberField
        id="arm-deviceCapacity"
        label="거치 가능 대수"
        unit="대"
        isRequired
        value={draft.deviceCapacity}
        error={errors.deviceCapacity}
        onChange={(value) => onChange({ deviceCapacity: value })}
        help="듀얼 암이면 2입니다. 확인하지 않고 1로 두지 마세요 — 기본값이 없는 필수 항목입니다."
      />
      <NumberField
        id="arm-allowedLoadG"
        label="허용 하중"
        unit="g"
        isRequired
        value={draft.allowedLoadG}
        error={errors.allowedLoadG}
        onChange={(value) => onChange({ allowedLoadG: value })}
        help="그램 정수입니다(9kg = 9000). 모니터 무게와 짝을 이루는 하중 판정의 필수 입력입니다."
      />
      <BooleanField
        id="arm-isClampMountable"
        label="클램프(상판 물림) 지원"
        value={draft.isClampMountable}
        error={errors.isClampMountable}
        isDisabled={isStand}
        onChange={(value) => onChange({ isClampMountable: value })}
        help={
          isStand
            ? '자립형은 상판에 물리지 않아 아니오로 고정됩니다.'
            : '암↔책상 호환성 판정의 게이트입니다. 아니오면 그 판정 자체를 돌리지 않습니다.'
        }
      />
      <BooleanField
        id="arm-isGrommetMountable"
        label="그로밋(타공 관통) 지원"
        value={draft.isGrommetMountable}
        error={errors.isGrommetMountable}
        isDisabled={isStand}
        onChange={(value) => onChange({ isGrommetMountable: value })}
        help={
          isStand
            ? '자립형은 타공에 끼우지 않아 아니오로 고정됩니다.'
            : '클램프와 동시에 지원하는 암이 흔합니다 — 둘 다 되면 둘 다 예로 둡니다.'
        }
      />
      <BooleanField
        id="arm-isWallMountable"
        label="벽 부착 지원"
        value={draft.isWallMountable}
        error={errors.isWallMountable}
        isDisabled={isStand}
        onChange={(value) => onChange({ isWallMountable: value })}
        help={
          isStand
            ? '자립형은 벽에 붙이지 않아 아니오로 고정됩니다.'
            : '벽 브래킷으로 고정할 수 있는 제품이면 예입니다.'
        }
      />
      <NumberField
        id="arm-clampMinMm"
        label="클램프 물림 최소 두께"
        unit="mm"
        value={draft.clampMinMm}
        error={errors.clampMinMm}
        onChange={(value) => onChange({ clampMinMm: value })}
        help="물릴 수 있는 상판 두께의 하한입니다. 모르면 비웁니다 — 0으로 채우면 판정이 거짓 '적합'을 냅니다."
      />
      <NumberField
        id="arm-clampMaxMm"
        label="클램프 물림 최대 두께"
        unit="mm"
        value={draft.clampMaxMm}
        error={errors.clampMaxMm}
        onChange={(value) => onChange({ clampMaxMm: value })}
        help="물릴 수 있는 상판 두께의 상한입니다. 모르면 비웁니다."
      />
      <NumberField
        id="arm-segmentCount"
        label="관절 세그먼트 개수"
        unit="개"
        value={draft.segmentCount}
        error={errors.segmentCount}
        onChange={(value) => onChange({ segmentCount: value })}
        help="다관절 암의 마디 수입니다. 해당 없으면 비웁니다."
      />
      <NumberField
        id="arm-poleHeightMm"
        label="폴 높이"
        unit="mm"
        value={draft.poleHeightMm}
        error={errors.poleHeightMm}
        onChange={(value) => onChange({ poleHeightMm: value })}
        help="폴형일 때 기둥 길이입니다. 폴이 없으면 비웁니다."
      />
      <NumberField
        id="arm-reachMinMm"
        label="전후 도달 최소"
        unit="mm"
        value={draft.reachMinMm}
        error={errors.reachMinMm}
        onChange={(value) => onChange({ reachMinMm: value })}
        help="암을 접었을 때 앞으로 나오는 거리입니다."
      />
      <NumberField
        id="arm-reachMaxMm"
        label="전후 도달 최대"
        unit="mm"
        value={draft.reachMaxMm}
        error={errors.reachMaxMm}
        onChange={(value) => onChange({ reachMaxMm: value })}
        help="암을 다 폈을 때 앞으로 나오는 거리입니다."
      />
      <NumberField
        id="arm-heightMinMm"
        label="거치 높이 최소"
        unit="mm"
        value={draft.heightMinMm}
        error={errors.heightMinMm}
        onChange={(value) => onChange({ heightMinMm: value })}
        help="상판 기준으로 가장 낮게 내렸을 때의 거치 높이입니다."
      />
      <NumberField
        id="arm-heightMaxMm"
        label="거치 높이 최대"
        unit="mm"
        value={draft.heightMaxMm}
        error={errors.heightMaxMm}
        onChange={(value) => onChange({ heightMaxMm: value })}
        help="가장 높게 올렸을 때의 거치 높이입니다. 조절 폭은 따로 저장하지 않고 두 값에서 계산합니다."
      />
      <NumberField
        id="arm-tiltMinDeg"
        label="틸트 최소 각"
        unit="°"
        value={draft.tiltMinDeg}
        error={errors.tiltMinDeg}
        onChange={(value) => onChange({ tiltMinDeg: value })}
        help="아래로 기울어지는 쪽은 음수로 씁니다. (예: -15)"
      />
      <NumberField
        id="arm-tiltMaxDeg"
        label="틸트 최대 각"
        unit="°"
        value={draft.tiltMaxDeg}
        error={errors.tiltMaxDeg}
        onChange={(value) => onChange({ tiltMaxDeg: value })}
        help="위로 젖혀지는 각도입니다."
      />
      <NumberField
        id="arm-swivelRangeDeg"
        label="좌우 스위블 총 가동 범위"
        unit="°"
        value={draft.swivelRangeDeg}
        error={errors.swivelRangeDeg}
        onChange={(value) => onChange({ swivelRangeDeg: value })}
        help="한쪽 끝값이 아니라 좌우를 합친 총 범위입니다. 카탈로그 표기·필터용이며 3D 관절 한계는 에셋 매니페스트가 정합니다."
      />
      <NumberField
        id="arm-pivotRangeDeg"
        label="화면 피벗 총 가동 범위"
        unit="°"
        value={draft.pivotRangeDeg}
        error={errors.pivotRangeDeg}
        isDisabled={isMic}
        onChange={(value) => onChange({ pivotRangeDeg: value })}
        help={
          isMic
            ? '마이크암엔 화면 세로 회전 개념이 없어 비워 둡니다.'
            : '화면을 세로로 돌릴 수 있는 총 범위입니다. 카탈로그 표기·필터용입니다.'
        }
      />
      <BooleanField
        id="arm-isVesaPlateDetachable"
        label="VESA 플레이트 분리 가능"
        value={draft.isVesaPlateDetachable}
        error={errors.isVesaPlateDetachable}
        isDisabled={isMic}
        onChange={(value) => onChange({ isVesaPlateDetachable: value })}
        help={
          isMic
            ? '마이크암엔 VESA 플레이트가 없어 아니오로 고정됩니다.'
            : '모니터에 먼저 플레이트만 붙이고 나중에 끼우는 방식이면 예입니다.'
        }
      />
      <BooleanField
        id="arm-hasCableManagement"
        label="케이블 정리 기능"
        value={draft.hasCableManagement}
        error={errors.hasCableManagement}
        onChange={(value) => onChange({ hasCableManagement: value })}
        help="암 내부로 케이블을 통과시키는 홈·커버가 있으면 예입니다."
      />
    </FormSection>
  );
};

export default ArmSpecFields;
