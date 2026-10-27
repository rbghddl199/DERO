// 모니터(MONITOR) 규격 입력 — erd.md §3 `monitor` 전 컬럼. 인치·화면비·베젤이 정본이고
// mm 외형은 서버가 매번 파생한다. 평면 패널이면 곡률 입력을 잠근다(서버 422 규칙 선반영).

import { PANEL_SHAPE_OPTIONS } from '@/constants/admin/productForm';
import type { FieldErrors, MonitorSpecDraft } from '@/types/admin/productForm';
import {
  BooleanField,
  FormSection,
  NumberField,
  SelectField,
  TextField,
} from './ProductFormFields';

type Props = {
  draft: MonitorSpecDraft;
  errors: FieldErrors;
  onChange: (patch: Partial<MonitorSpecDraft>) => void;
};

const MonitorSpecFields = ({ draft, errors, onChange }: Props) => {
  const isFlat = draft.panelShape === 'FLAT';

  return (
    <FormSection
      title="모니터 규격"
      description="화면 mm 치수는 저장하지 않습니다 — 인치·화면비·베젤에서 서버가 계산합니다."
    >
      <NumberField
        id="monitor-diagonalInch"
        label="대각 화면 크기"
        unit="inch"
        isRequired
        value={draft.diagonalInch}
        error={errors.diagonalInch}
        onChange={(value) => onChange({ diagonalInch: value })}
        help="소수점 첫째 자리까지 입력합니다. (예: 27, 34.5) 형상 생성의 정본 입력입니다."
      />
      <NumberField
        id="monitor-bezelMm"
        label="베젤 폭"
        unit="mm"
        isRequired
        value={draft.bezelMm}
        error={errors.bezelMm}
        onChange={(value) => onChange({ bezelMm: value })}
        help="화면 둘레 베젤의 한쪽 폭입니다. 패널 외형 = 화면 + 이 값 × 2로 계산됩니다."
      />
      <NumberField
        id="monitor-aspectWidth"
        label="화면비 가로 항"
        isRequired
        value={draft.aspectWidth}
        error={errors.aspectWidth}
        onChange={(value) => onChange({ aspectWidth: value })}
        help="실제 패널 비율의 가로 항입니다. 34형 울트라와이드는 마케팅 표기(21:9)가 아니라 3440×1440 기준 43을 넣습니다."
      />
      <NumberField
        id="monitor-aspectHeight"
        label="화면비 세로 항"
        isRequired
        value={draft.aspectHeight}
        error={errors.aspectHeight}
        onChange={(value) => onChange({ aspectHeight: value })}
        help="실제 패널 비율의 세로 항입니다. 위 예시라면 18을 넣습니다."
      />
      <SelectField
        id="monitor-panelShape"
        label="패널 형태"
        isRequired
        value={draft.panelShape}
        error={errors.panelShape}
        options={PANEL_SHAPE_OPTIONS}
        onChange={(value) =>
          onChange({
            panelShape: value as MonitorSpecDraft['panelShape'],
            // 평면으로 바꾸면 이미 적어 둔 곡률을 지운다 — 남겨 두면 서버가 422로 막는다.
            ...(value === 'FLAT' ? { curvatureRadiusMm: '' } : {}),
          })
        }
        help="평면인지 곡면인지 고릅니다. 평면을 고르면 곡률 반경 입력이 잠깁니다."
      />
      <NumberField
        id="monitor-curvatureRadiusMm"
        label="곡률 반경"
        unit="mm"
        value={draft.curvatureRadiusMm}
        error={errors.curvatureRadiusMm}
        isDisabled={isFlat || draft.panelShape === ''}
        onChange={(value) => onChange({ curvatureRadiusMm: value })}
        help={
          isFlat
            ? '평면 모니터는 곡률이 존재하지 않아 비워 둡니다.'
            : '1800R이면 1800을 넣습니다. 곡면 제품에만 입력합니다.'
        }
      />
      <NumberField
        id="monitor-panelThicknessMm"
        label="패널 두께"
        unit="mm"
        value={draft.panelThicknessMm}
        error={errors.panelThicknessMm}
        onChange={(value) => onChange({ panelThicknessMm: value })}
        help="제품별 실측 두께입니다. 모르면 비우세요 — 서버가 제네릭 28mm를 씁니다."
      />
      <NumberField
        id="monitor-standDepthMm"
        label="스탠드 발판 깊이"
        unit="mm"
        isRequired
        value={draft.standDepthMm}
        error={errors.standDepthMm}
        onChange={(value) => onChange({ standDepthMm: value })}
        help="기본 스탠드가 책상에서 차지하는 앞뒤 깊이입니다. (참고: 27형 평면 130 / 34형 곡면 230)"
      />
      <NumberField
        id="monitor-weightG"
        label="무게"
        unit="g"
        isRequired
        value={draft.weightG}
        error={errors.weightG}
        onChange={(value) => onChange({ weightG: value })}
        help="그램 정수입니다(5.2kg = 5200). 모니터암 허용 하중 판정의 필수 입력이라 반드시 실측값을 넣습니다."
      />
      <BooleanField
        id="monitor-isStandDetachable"
        label="기본 스탠드 분리 가능"
        value={draft.isStandDetachable}
        error={errors.isStandDetachable}
        onChange={(value) => onChange({ isStandDetachable: value })}
        help="스탠드를 떼고 모니터암에 물릴 수 있는지 여부입니다. 미선택으로는 저장할 수 없습니다."
      />
      <BooleanField
        id="monitor-isPivotSupported"
        label="피벗(세로 회전) 지원"
        value={draft.isPivotSupported}
        error={errors.isPivotSupported}
        onChange={(value) => onChange({ isPivotSupported: value })}
        help="기본 스탠드로 화면을 세로로 돌릴 수 있는지 여부입니다."
      />
      <NumberField
        id="monitor-swivelMaxDeg"
        label="좌우 스위블 최대 각"
        unit="°"
        value={draft.swivelMaxDeg}
        error={errors.swivelMaxDeg}
        onChange={(value) => onChange({ swivelMaxDeg: value })}
        help="카탈로그 표기·필터용입니다. 스펙시트에 없으면 비웁니다."
      />
      <NumberField
        id="monitor-heightAdjustRangeMm"
        label="높이 조절 폭"
        unit="mm"
        value={draft.heightAdjustRangeMm}
        error={errors.heightAdjustRangeMm}
        onChange={(value) => onChange({ heightAdjustRangeMm: value })}
        help="기본 스탠드로 오르내릴 수 있는 총 폭입니다. 조절이 안 되면 비웁니다."
      />
      <NumberField
        id="monitor-tiltMinDeg"
        label="틸트 최소 각"
        unit="°"
        value={draft.tiltMinDeg}
        error={errors.tiltMinDeg}
        onChange={(value) => onChange({ tiltMinDeg: value })}
        help="아래로 기울어지는 쪽은 음수로 씁니다. (예: -5)"
      />
      <NumberField
        id="monitor-tiltMaxDeg"
        label="틸트 최대 각"
        unit="°"
        value={draft.tiltMaxDeg}
        error={errors.tiltMaxDeg}
        onChange={(value) => onChange({ tiltMaxDeg: value })}
        help="위로 젖혀지는 각도입니다. (예: 20)"
      />
      <TextField
        id="monitor-ports"
        label="포트 목록"
        value={draft.ports}
        error={errors.ports}
        onChange={(value) => onChange({ ports: value })}
        placeholder="HDMI 2.0, DP 1.4"
        help="쉼표로 구분해 적습니다. 표시 전용이라 호환성 판정에는 쓰이지 않습니다."
      />
    </FormSection>
  );
};

export default MonitorSpecFields;
