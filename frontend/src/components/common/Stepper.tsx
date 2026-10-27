'use client';
// 재사용 스텝 마법사 — React Bits Stepper 이식. 원형 인디케이터+연결선, 슬라이드 전환,
// Back/Next(Complete) 푸터를 통째로 관리한다. 원본은 'motion/react'를 쓰지만 이 저장소는
// 이미 동등한 API의 framer-motion을 의존성으로 갖고 있어 그걸 그대로 쓴다(ElasticSlider와
// 같은 이유 — 같은 라이브러리를 이름만 다르게 두 번 설치하지 않기 위함).
// 원본 대비 바뀐 것:
//  - canProceed(step) 프롭 추가 — 원본엔 다음/완료를 막을 방법이 없었다(호출부가 페이지
//    끄트머리에 있는 것과 별개로, 필수 입력을 안 채운 채 다음 단계로 넘어가는 걸 막아야 함).
//    Next/Complete 버튼을 비활성화하고, 스텝 인디케이터 클릭으로 앞 단계를 건너뛰는 것도 막는다
//    (뒤로 가는 클릭만 허용).
//  - 원본의 뷰포트 중앙 정렬·고정 종횡비 래퍼(데모 페이지 전용 레이아웃)와 다크 테마
//    (보라/초록/#222)를 걷어내고, 이 앱의 라이트 톤 디자인 토큰(paper/primary/ash/ink)에 맞췄다.
//  - max-w-md 캡을 없앴다 — 호출부(CraftNewWizard)의 1단계는 3열 그리드라 좁은 카드폭이 안 맞는다.

import {
  Children,
  forwardRef,
  Fragment,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  useLayoutEffect,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
  type SVGProps,
} from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';

// 스텝 콘텐츠 래퍼는 높이를 실측값으로 애니메이션하기 위해 overflow:hidden을 쓴다 — 안의
// 콘텐츠가 만드는 box-shadow(글로우 등) 시각 효과가 이 경계에 바로 잘려나가지 않도록 여백을
// 준다. 세로 여백(py-8 = 32px × 2면)은 실측 높이(parentHeight)에 그대로 더해야 한다 — 안
// 더하면 border-box 높이가 padding만큼 콘텐츠 영역을 갉아먹어 실제 콘텐츠가 눌린다.
// 절대 위치 자식은 조상의 padding을 무시한다(top:0이 padding-box가 아니라 border-box
// 가장자리에 바로 붙는다) — SlideTransition의 `top: 0`이 그 함정이라 위 buffer 64px가
// 전부 아래쪽에만 쌓이고 위쪽 glow는 0px 여유로 그대로 잘렸다(2026-07-28, 실측+스크린샷으로
// 확인). `top`을 padding 절반만큼 명시적으로 띄워 위/아래에 32px씩 고르게 나눈다.
const CONTENT_VERTICAL_PADDING_PX = 32; // py-8
// 위와 같은 이유로 좌우도 필요하다 — SlideTransition의 `left:0, right:0`는 조상의
// `px-10`(40px)을 무시하고 border-box 가장자리에 바로 붙어, 스텝 콘텐츠가 실제로는
// 좌우 여백 없이 렌더된다. 평소엔 안 보이지만 카드 글로우(box-shadow)를 쓰는 스텝(책상
// 선택)에서 그리드 맨 왼쪽/오른쪽 카드는 바깥으로 번질 여백이 0px라 글로우가 뭉텅 잘렸다
// (2026-07-28, CraftDeskPicker 글로우 클리핑 버그로 발견).
const CONTENT_HORIZONTAL_PADDING_PX = 40; // px-10

type StepperProps = {
  children: ReactNode;
  initialStep?: number;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void;
  /** step(1-index)이 유효하지 않으면 false — Next/Complete를 비활성화한다. 생략하면 항상 허용. */
  canProceed?: (step: number) => boolean;
  /** true면 Next/Complete 버튼을 아예 숨긴다 — 스텝 내부의 다른 액션(예: "이 규격 적용")이
   *  다음 단계 진입을 대신 트리거하는 경우에 쓴다. `ref`의 `goToNext`와 짝을 이룬다. */
  hideNextButton?: boolean;
  stepCircleContainerClassName?: string;
  stepContainerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
  backButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  nextButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  backButtonText?: string;
  nextButtonText?: string;
  disableStepIndicators?: boolean;
  renderStepIndicator?: (props: {
    step: number;
    currentStep: number;
    onStepClick: (clicked: number) => void;
  }) => ReactNode;
  /** 각 스텝 원 옆에 옅은 회색으로 적는 제목 — 인덱스가 스텝(1-index)과 대응한다. */
  stepTitles?: string[];
  dataTestId?: string;
};

export type StepperHandle = {
  /** canProceed 게이트 없이 다음 스텝으로 넘어간다 — 호출부가 이미 유효성을 확인했다고 보장할 때만 쓸 것. */
  goToNext: () => void;
  /** "이전" 버튼과 같은 동작 — 브라우저 뒤로가기를 스텝 내부 이동으로 처리하고 싶은 호출부용
   *  (2026-08-06, CraftNewWizard의 히스토리 가드). */
  goToPrev: () => void;
};

const Stepper = forwardRef<StepperHandle, StepperProps>(
  (
    {
      children,
      initialStep = 1,
      onStepChange = () => {},
      onFinalStepCompleted = () => {},
      canProceed,
      hideNextButton = false,
      stepCircleContainerClassName = '',
      stepContainerClassName = '',
      contentClassName = '',
      footerClassName = '',
      backButtonProps = {},
      nextButtonProps = {},
      backButtonText = 'Back',
      nextButtonText = 'Continue',
      disableStepIndicators = false,
      renderStepIndicator,
      stepTitles,
      dataTestId,
    }: StepperProps,
    ref: Ref<StepperHandle>,
  ) => {
    const [currentStep, setCurrentStep] = useState<number>(initialStep);
    const [direction, setDirection] = useState<number>(0);
    const stepsArray = Children.toArray(children);
    const totalSteps = stepsArray.length;
    const isCompleted = currentStep > totalSteps;
    const isLastStep = currentStep === totalSteps;
    const proceedAllowed = canProceed ? canProceed(currentStep) : true;

    const updateStep = useCallback(
      (newStep: number): void => {
        setCurrentStep(newStep);
        if (newStep > totalSteps) {
          onFinalStepCompleted();
        } else {
          onStepChange(newStep);
        }
      },
      [totalSteps, onFinalStepCompleted, onStepChange],
    );

    const handleBack = (): void => {
      if (currentStep > 1) {
        setDirection(-1);
        updateStep(currentStep - 1);
      }
    };

    const handleNext = (): void => {
      if (!proceedAllowed) return;
      if (!isLastStep) {
        setDirection(1);
        updateStep(currentStep + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    const handleComplete = (): void => {
      if (!proceedAllowed) return;
      setDirection(1);
      updateStep(totalSteps + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleIndicatorClick = (clicked: number): void => {
      // 앞 단계로 건너뛰기는 금지(필수 입력 우회 방지) — 이미 지난 단계로 돌아가는 것만 허용.
      if (clicked >= currentStep) return;
      setDirection(-1);
      updateStep(clicked);
    };

    useImperativeHandle(
      ref,
      () => ({
        goToNext: () => {
          if (!isLastStep) {
            setDirection(1);
            updateStep(currentStep + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        },
        goToPrev: () => {
          if (currentStep > 1) {
            setDirection(-1);
            updateStep(currentStep - 1);
          }
        },
      }),
      [currentStep, isLastStep, updateStep],
    );

    const showBackButton = currentStep !== 1;
    const showNextButton = !hideNextButton;

    return (
      <div
        data-testid={dataTestId}
        className={`bg-paper w-full rounded-2xl ${stepCircleContainerClassName}`}
      >
        <div className={`${stepContainerClassName} flex w-full items-center px-10 py-6`}>
          {stepsArray.map((_, index) => {
            const stepNumber = index + 1;
            const isNotLastStep = index < totalSteps - 1;
            return (
              <Fragment key={stepNumber}>
                {renderStepIndicator ? (
                  renderStepIndicator({
                    step: stepNumber,
                    currentStep,
                    onStepClick: handleIndicatorClick,
                  })
                ) : (
                  <StepIndicator
                    step={stepNumber}
                    title={stepTitles?.[index]}
                    disableStepIndicators={disableStepIndicators}
                    currentStep={currentStep}
                    onClickStep={handleIndicatorClick}
                  />
                )}
                {isNotLastStep && <StepConnector isComplete={currentStep > stepNumber} />}
              </Fragment>
            );
          })}
        </div>

        <StepContentWrapper
          isCompleted={isCompleted}
          currentStep={currentStep}
          direction={direction}
          className={`px-10 py-8 ${contentClassName}`}
        >
          {stepsArray[currentStep - 1]}
        </StepContentWrapper>

        {!isCompleted && (showBackButton || showNextButton) && (
          <div className={`px-10 pb-8 ${footerClassName}`}>
            <div className={`flex ${showBackButton ? 'justify-between' : 'justify-end'}`}>
              {showBackButton && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="border-ash/40 text-ink hover:border-primary-300 rounded-xl border px-5 py-3 text-[15px] font-medium transition-colors"
                  {...backButtonProps}
                >
                  {backButtonText}
                </button>
              )}
              {showNextButton && (
                <button
                  type="button"
                  onClick={isLastStep ? handleComplete : handleNext}
                  disabled={!proceedAllowed}
                  className="bg-primary-200 hover:bg-primary-400 active:bg-primary-500 rounded-xl px-5 py-3 text-[15px] font-medium text-neutral-900 transition-colors disabled:pointer-events-none disabled:opacity-40"
                  {...nextButtonProps}
                >
                  {isLastStep ? '생성하기' : nextButtonText}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
);
Stepper.displayName = 'Stepper';

type StepContentWrapperProps = {
  isCompleted: boolean;
  currentStep: number;
  direction: number;
  children: ReactNode;
  className?: string;
};

const StepContentWrapper = ({
  isCompleted,
  currentStep,
  direction,
  children,
  className = '',
}: StepContentWrapperProps) => {
  const [parentHeight, setParentHeight] = useState<number>(0);

  return (
    <motion.div
      style={{ position: 'relative', overflow: 'hidden' }}
      animate={{ height: isCompleted ? 0 : parentHeight + CONTENT_VERTICAL_PADDING_PX * 2 }}
      transition={{ type: 'spring', duration: 0.4 }}
      className={className}
    >
      <AnimatePresence initial={false} mode="sync" custom={direction}>
        {!isCompleted && (
          <SlideTransition key={currentStep} direction={direction} onHeightReady={setParentHeight}>
            {children}
          </SlideTransition>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

type SlideTransitionProps = {
  children: ReactNode;
  direction: number;
  onHeightReady: (height: number) => void;
};

const SlideTransition = ({ children, direction, onHeightReady }: SlideTransitionProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // children이 바뀔 때 한 번만 재는 것으로는 부족하다 — 같은 스텝 안에서 자식이 자기
  // state로 내용을 펼치는 경우(예: "직접 입력" 카드 클릭 시 규격 폼이 펼쳐짐)는 이 스텝
  // 컴포넌트 자체가 리렌더되지 않아 effect가 다시 안 돈다. ResizeObserver로 실제 DOM
  // 높이를 계속 지켜봐야 폼이 부모의 고정 height + overflow:hidden에 잘리지 않는다
  // (2026-07-28, "직접 규격 입력" 폼이 안 보이던 버그).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    onHeightReady(el.offsetHeight);
    const observer = new ResizeObserver(() => onHeightReady(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeightReady]);

  return (
    <motion.div
      ref={containerRef}
      custom={direction}
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.4 }}
      style={{
        position: 'absolute',
        left: CONTENT_HORIZONTAL_PADDING_PX,
        right: CONTENT_HORIZONTAL_PADDING_PX,
        top: CONTENT_VERTICAL_PADDING_PX,
      }}
    >
      {children}
    </motion.div>
  );
};

const stepVariants: Variants = {
  enter: (dir: number) => ({
    x: dir >= 0 ? '-100%' : '100%',
    opacity: 0,
  }),
  center: {
    x: '0%',
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir >= 0 ? '50%' : '-50%',
    opacity: 0,
  }),
};

type StepProps = {
  children: ReactNode;
};

export const Step = ({ children }: StepProps) => <div>{children}</div>;

type StepIndicatorProps = {
  step: number;
  currentStep: number;
  onClickStep: (clicked: number) => void;
  disableStepIndicators?: boolean;
  title?: string;
};

const StepIndicator = ({
  step,
  currentStep,
  onClickStep,
  disableStepIndicators = false,
  title,
}: StepIndicatorProps) => {
  const status = currentStep === step ? 'active' : currentStep < step ? 'inactive' : 'complete';

  const handleClick = (): void => {
    if (step !== currentStep && !disableStepIndicators) {
      onClickStep(step);
    }
  };

  return (
    <motion.div
      onClick={handleClick}
      data-testid={`stepper-indicator-${step}`}
      className={`relative flex shrink-0 items-center gap-2 outline-none focus:outline-none ${disableStepIndicators ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
      animate={status}
      initial={false}
    >
      <motion.div
        // framer-motion의 색 트윈은 실제 색상값이 필요해 var()를 못 씀 — globals.css
        // 토큰(fog/ash/primary-300/400/ink)의 리터럴 hex를 그대로 옮겼다.
        variants={{
          inactive: { backgroundColor: '#f4f4f4', color: '#a3a3a3' },
          active: { backgroundColor: '#f0bb4c', color: '#ffffff' },
          complete: { backgroundColor: '#f8d172', color: '#ffffff' },
        }}
        transition={{ duration: 0.3 }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold"
      >
        {status === 'complete' ? (
          <CheckIcon className="h-4 w-4" />
        ) : (
          <span className="text-[13px]">{step}</span>
        )}
      </motion.div>
      {title && <span className="text-ash text-[13px]">{title}</span>}
    </motion.div>
  );
};

type StepConnectorProps = {
  isComplete: boolean;
};

const StepConnector = ({ isComplete }: StepConnectorProps) => {
  const lineVariants: Variants = {
    incomplete: { width: 0, backgroundColor: 'transparent' },
    complete: { width: '100%', backgroundColor: '#f8d172' },
  };

  return (
    <div className="bg-ash/30 relative mx-2 h-px flex-1 overflow-hidden rounded">
      <motion.div
        className="absolute top-0 left-0 h-full"
        variants={lineVariants}
        initial={false}
        animate={isComplete ? 'complete' : 'incomplete'}
        transition={{ duration: 0.4 }}
      />
    </div>
  );
};

const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...props} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <motion.path
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ delay: 0.1, type: 'tween', ease: 'easeOut', duration: 0.3 }}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M5 13l4 4L19 7"
    />
  </svg>
);

export default Stepper;
