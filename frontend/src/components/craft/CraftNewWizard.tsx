'use client';
// 새 데스크테리어 마법사 — 책상 선택 → 예산 입력 → 제목 작성 3단계. 각 단계 상태는 여기서
// 들고 있고, 진행·검증 게이트·완료 시 라우팅은 공용 Stepper(components/common/Stepper.tsx)에
// 맡긴다. 완료 시 선택값을 쿼리로 실어 /simulator에 넘긴다(엔진이 없는 이 페이지에선 store
// action을 못 써서 3D 엔진 부팅 뒤 SimulatorCanvas가 읽어 적용한다, CraftDeskPicker.tsx와 동일 이유).

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPlacement } from '@/api/placement';
import { TEMP_DESK_TEXTURE_ID } from '@/constants/deskTexture';
import { useHistoryBackGuard } from '@/hooks/useHistoryBackGuard';
import type { DeskFrameType } from '@/three/core/deskConfig';
import type { FrameType as BackendFrameType, PlacementSnapshot } from '@/types/placement';
import Stepper, { Step, type StepperHandle } from '@/components/common/Stepper';
import CraftDeskPicker, {
  type CraftDeskPickerHandle,
  type DeskSelection,
  type PickerMode,
} from './CraftDeskPicker';
import CraftBudgetStep from './CraftBudgetStep';
import CraftNameStep from './CraftNameStep';
import CraftStepIcon, { type CraftStepIconName } from './CraftStepIcon';

const DEFAULT_BUDGET_KRW = 300_000;

const FRAME_TYPE_TO_BACKEND: Record<DeskFrameType, BackendFrameType> = {
  't-frame': 'T_FRAME',
  'four-leg': 'FOUR_LEG',
  'top-only': 'TOP_ONLY',
};

const STEP_TITLES = ['책상을 선택하세요', '예산을 입력하세요', '제목을 입력하세요'] as const;
const STEP_ICONS: CraftStepIconName[] = ['desk', 'budget', 'title'];

const CraftNewWizard = () => {
  const router = useRouter();
  const stepperRef = useRef<StepperHandle>(null);
  const deskPickerRef = useRef<CraftDeskPickerHandle>(null);
  const [step, setStep] = useState(1);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [deskSelection, setDeskSelection] = useState<DeskSelection | null>(null);
  const [customFormOpen, setCustomFormOpen] = useState(false);
  const [budgetKrw, setBudgetKrw] = useState(DEFAULT_BUDGET_KRW);
  const [projectName, setProjectName] = useState('');
  // 완료 시 /simulator로 라우터 push하기 직전에 이 가드를 꺼서, sentinel이 언마운트 cleanup으로
  // 먼저 걷힌 뒤(history.back() 한 번 — sentinel과 같은 URL이라 화면엔 아무 변화가 없다) 진짜
  // 이동이 뒤따르게 한다. 끄지 않으면 라우팅 뒤 컴포넌트가 언마운트되면서 같은 cleanup이 뒤늦게
  // 돌아 방금 들어간 /simulator에서 그대로 이 페이지로 되돌아가 버린다(사이 실제 API 왕복이 있어
  // 순서가 보장된다 — useUnsavedDraftGuard의 저장 성공 경로와 같은 패턴).
  const [isLeavingWizard, setIsLeavingWizard] = useState(false);

  const handleStepChange = (newStep: number): void => {
    setStep(newStep);
    // 책상 선택 스텝을 벗어나면 직접 입력 폼도 닫는다 — CraftDeskPicker가 스텝 전환 시
    // 언마운트되어 dims 등 다른 폼 state는 어차피 초기화되는데, 부모로 끌어올린 이 state만
    // 남아있으면 "뒤로" 눌러 돌아왔을 때 초기화된 폼이 혼자 펼쳐진 채로 보인다.
    if (newStep !== 1) setCustomFormOpen(false);
  };

  // 브라우저 "뒤로가기"가 곧장 이 페이지를 떠나지 않게 한다 — 책상(모드 선택→템플릿/직접입력)
  // → 예산 → 제목까지, 마법사 안에서 밟은 만큼 한 단계씩 되돌아가고, 맨 처음 화면(책상 모드
  // 선택)에서는 가드 자체가 꺼져 있어 진짜 뒤로가기가 그대로 동작한다(2026-08-06 사용자 리포트:
  // 뒤로가기가 스텝을 건너뛰고 곧장 /craft로 나가버림).
  //
  // **되돌릴 것이 있을 때만 켠다 — 마운트 시점에 항상 true로 켜면 안 된다**(2026-08-06 2차
  // 리포트: /craft에서 "새로 만들기"를 눌러도 화면이 안 바뀜). dev StrictMode가 마운트 effect를
  // 두 번 돌리는데(마운트→정리→재실행), 정리의 sentinel 회수 history.back()과 재실행의
  // pushState가 같은 틱에 붙으면 pushState가 조용히 버려진다(훅 상단 주석의 실측). 남은 back
  // 이동이 완료되면 두 번째 리스너가 그걸 "사용자 뒤로가기"로 받아 leave()를 불러, 진입하자마자
  // /craft로 튕겨 나갔다 — EditorTopBar가 hasUnsavedChanges(마운트 시 false)로 켜는 것과 같은
  // 이유로, 초기 화면(step 1·모드 선택)에서는 꺼 둔다.
  useHistoryBackGuard(!isLeavingWizard && (step > 1 || pickerMode !== null), (leave, stay) => {
    if (step > 1) {
      stepperRef.current?.goToPrev();
      stay();
      return;
    }
    if (pickerMode !== null) {
      deskPickerRef.current?.resetToModeSelect();
      stay();
      return;
    }
    // enabled 조건상 여기 올 일이 없지만(step 1·모드 선택이면 가드가 꺼져 있다) 방어적으로 남긴다.
    leave();
  });

  const canProceed = (step: number): boolean => {
    if (step === 1) return deskSelection !== null;
    if (step === 3) return projectName.trim().length > 0;
    return true;
  };

  const handleFinalStepCompleted = async (): Promise<void> => {
    if (!deskSelection) return;
    setIsLeavingWizard(true);

    const params = new URLSearchParams();
    params.set('budgetKrw', String(budgetKrw));
    params.set('projectName', projectName.trim());
    // 로컬/실제 카탈로그 구분 없이 완성된 DeskConfig를 그대로 넘긴다 — /simulator는 이미
    // customDesk 파라미터 하나로 setDeskConfig(config)를 부르는 경로가 있고, buildDesk(config)는
    // source가 'product'든 'custom'이든 치수·재질·프레임만 본다(CraftDeskPicker.tsx 참고).
    const config = deskSelection.config;
    params.set('customDesk', JSON.stringify(config));

    const desk: PlacementSnapshot['desk'] =
      deskSelection.source === 'product'
        ? {
            specSource: 'PRODUCT',
            productId: deskSelection.productId,
            widthMm: null,
            depthMm: null,
            heightMm: null,
            topThicknessMm: null,
            edgeThicknessMm: null,
            deskTextureId: null,
            frameType: null,
          }
        : {
            specSource: 'CUSTOM',
            productId: null,
            widthMm: config.widthMm,
            depthMm: config.depthMm,
            heightMm: config.heightMm,
            topThicknessMm: config.topThicknessMm,
            edgeThicknessMm: config.edgeThicknessMm ?? null,
            // 사용자가 고른 desk_texture 마스터 id(DERO-335) — 재질 목록을 못 받았을 때만
            // 시딩 기본값으로 떨어진다.
            deskTextureId: config.deskTextureId ?? TEMP_DESK_TEXTURE_ID,
            frameType: FRAME_TYPE_TO_BACKEND[config.frameType],
          };

    const snapshot: PlacementSnapshot = {
      title: projectName.trim(),
      description: null,
      // 신규 저장이라 비교할 현재 버전이 없다. 게시 상태는 서버가 정한다(ADR-0015 결정 10).
      version: null,
      isRoomLightOn: true,
      budgetKrw,
      desk,
      items: [],
    };

    try {
      const response = await createPlacement(snapshot);
      params.set('placementId', String(response.id));
    } catch (error) {
      // 저장에 실패해도 씬 편집은 계속할 수 있어야 한다 — 배치 영속화는 이 스텝의 부가 기능이지
      // 진입 게이트가 아니다.
      console.error('[CraftNewWizard] 배치 생성에 실패했습니다', error);
    }

    router.push(`/simulator?${params.toString()}`);
  };

  return (
    <div>
      <h1 className="font-swiss text-ink flex items-center gap-3 text-[42px] leading-[1.1] font-medium tracking-[-0.03em]">
        <CraftStepIcon name={STEP_ICONS[step - 1]} className="text-primary-500 shrink-0" />
        {STEP_TITLES[step - 1]}
      </h1>

      <div className="mt-6">
        <Stepper
          ref={stepperRef}
          dataTestId="craft-wizard-stepper"
          canProceed={canProceed}
          onStepChange={handleStepChange}
          onFinalStepCompleted={handleFinalStepCompleted}
          hideNextButton={step === 1}
          backButtonText="이전"
          nextButtonText="다음"
          stepTitles={['책상', '예산', '제목']}
        >
          <Step>
            <CraftDeskPicker
              ref={deskPickerRef}
              value={deskSelection}
              onChange={setDeskSelection}
              customFormOpen={customFormOpen}
              onCustomFormOpenChange={setCustomFormOpen}
              onApplied={() => stepperRef.current?.goToNext()}
              onModeChange={setPickerMode}
            />
          </Step>
          <Step>
            <CraftBudgetStep value={budgetKrw} onChange={setBudgetKrw} />
          </Step>
          <Step>
            <CraftNameStep value={projectName} onChange={setProjectName} />
          </Step>
        </Stepper>
      </div>
    </div>
  );
};

export default CraftNewWizard;
