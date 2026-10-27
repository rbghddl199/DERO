'use client';
// 새 데스크테리어 마법사 2단계 — 예산(원) 입력 (REQ-ENV-02). 슬라이더로 고르면 구간별
// 추천 세팅 정보(대상·주요 품목·특징)를 바로 보여준다. Stepper(공용 컴포넌트)가 카드
// 테두리·이전/다음 푸터를 대신 그리므로 이 컴포넌트는 순수 컨트롤드 콘텐츠만 맡는다.

import ElasticSlider from '@/components/common/ElasticSlider';

type Props = {
  value: number;
  onChange: (budgetKrw: number) => void;
};

type BudgetTier = {
  rangeLabel: string;
  title: string;
  /** title 맨 앞 부분 중 강조색을 입힐 구간 — title의 접두 문자열이어야 한다. */
  titleAccent: string;
  target: string;
  items: string[];
  feature: string;
};

const BUDGET_TIERS: BudgetTier[] = [
  {
    rangeLabel: '3만원 ~ 10만원 미만',
    title: '소품 위주의 가벼운 세팅',
    titleAccent: '소품 위주',
    target:
      '사무실 책상이나 기존 책상 분위기를 소소하게 바꾸고 싶은 분 (직장인들이 가장 많이 소비하는 구간)',
    items: [
      '마우스 장패드 / 가죽 데스크 매트 (1~3만원)',
      '모니터 받침대 또는 미니 서랍장·모듈 정리함 (1~3만원)',
      '탁상시계, 무드등, 피규어, 캘린더 등 (1~4만원)',
    ],
    feature: '큰 가구나 전자기기 교체 없이 감성적인 소품만 더해 가성비 있게 꾸미는 단계예요',
  },
  {
    rangeLabel: '10만원 ~ 20만원 미만',
    title: '포인트 아이템을 더하는 세팅',
    titleAccent: '포인트 아이템',
    target: '소품만으로는 아쉽고, 조명이나 정리용품 같은 포인트 아이템을 하나씩 더하고 싶은 분',
    items: [
      '데스크 스탠드 조명 또는 미니 무드등 (3~7만원)',
      '케이블 정리 트레이 및 멀티탭 정리함 (2~5만원)',
      '보급형 키보드·마우스 세트 또는 데스크 매트 업그레이드 (3~8만원)',
    ],
    feature:
      '가구 교체 없이도 조명·정리용품 같은 포인트 아이템으로 분위기를 한 단계 끌어올리는 단계예요',
  },
  {
    rangeLabel: '20만원 ~ 50만원 미만',
    title: '가구 및 기본 장비 포함 중급 세팅',
    titleAccent: '가구 및 기본 장비',
    target: '책상·의자·모니터암·키보드 등 기본 작업 환경의 퀄리티를 함께 높이고 싶은 분',
    items: [
      '인체공학 데스크 의자 또는 모던한 책상 (10~30만원)',
      '기계식 커스텀 키보드 및 버티컬 마우스 (5~15만원)',
      '모니터 암 및 LED 모니터 라이트·스마트 조명 (3~10만원)',
      '수납장 및 멀티탭 정리함 등',
    ],
    feature:
      '시각적 만족감뿐 아니라 거북목 방지·손목 보호 같은 실사용 편의성도 함께 챙기는 단계예요',
  },
  {
    rangeLabel: '50만원 ~ 100만원 미만',
    title: '장비 완성도를 높이는 프리미엄 세팅',
    titleAccent: '장비 완성도',
    target:
      '기본 장비는 갖췄고, 의자·모니터·조명 등 핵심 장비를 프리미엄급으로 업그레이드하고 싶은 분',
    items: [
      '프리미엄 인체공학 의자 (30~60만원)',
      '듀얼 모니터 또는 울트라와이드 모니터 (30~60만원)',
      '고급 스피커·사운드바 또는 스마트 조명 시스템 (10~30만원)',
    ],
    feature: '기본기를 넘어 장비 하나하나의 완성도를 높여 전문가 셋업에 가까워지는 단계예요',
  },
  {
    rangeLabel: '100만원 ~ 수백만원 이상',
    title: '하이엔드 풀 셋업 (전문가·크리에이터형)',
    titleAccent: '하이엔드 풀 셋업',
    target: '모션데스크·고사양 데스크탑·프리미엄 오디오 등으로 완벽하게 맞추고 싶은 분',
    items: [
      '프리미엄 모션데스크 (40~100만원 이상)',
      '고급 하이엔드 모니터 듀얼·트리플 세팅 (50~150만원)',
      '고급 음향 장비·스피커, 커스텀 키보드 등 (20~50만원)',
    ],
    feature:
      'SNS·유튜브에서 볼 수 있는 전문가 포스의 셋업 — 소품보다 가구·IT 기기 비중이 압도적으로 높아요',
  },
];

const MIN_BUDGET = 30_000;
const MAX_BUDGET = 3_000_000;
const STEP_BUDGET = 10_000;

// 빠른 선택 버튼의 대표값(각 구간 중간값) 산출에 쓰는 경계 — BUDGET_TIERS와 순서·개수가
// 1:1로 대응해야 한다.
const BUDGET_BANDS = [
  { start: MIN_BUDGET, end: 100_000 },
  { start: 100_000, end: 200_000 },
  { start: 200_000, end: 500_000 },
  { start: 500_000, end: 1_000_000 },
  { start: 1_000_000, end: MAX_BUDGET },
];

function tierForBudget(value: number): BudgetTier {
  if (value < 100_000) return BUDGET_TIERS[0];
  if (value < 200_000) return BUDGET_TIERS[1];
  if (value < 500_000) return BUDGET_TIERS[2];
  if (value < 1_000_000) return BUDGET_TIERS[3];
  return BUDGET_TIERS[4];
}

const CraftBudgetStep = ({ value, onChange }: Props) => {
  const tier = tierForBudget(value);
  // 입력칸은 만원 단위로 받는다 — "1"을 입력하면 1만원(10,000원)이 되도록. STEP_BUDGET이
  // 이미 10,000이라 그대로 변환 배수로 쓰고, value/onChange 계약(원 단위)은 그대로 둔다.
  const manwonValue = Math.round(value / STEP_BUDGET);

  const handleNumberInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const raw = e.target.value;
    const manwon = Number(raw);
    if (!Number.isFinite(manwon)) return;
    // input[type=number]은 "01"과 1을 값이 같다고 보고(느슨한 비교) DOM을 안 고쳐써서
    // 앞의 0이 그대로 남는다 — React가 안 지워주니 직접 지운다.
    if (/^0\d/.test(raw)) e.target.value = String(manwon);
    onChange(manwon * STEP_BUDGET);
  };

  const handleNumberInputBlur = (): void => {
    onChange(Math.min(Math.max(value, MIN_BUDGET), MAX_BUDGET));
  };

  return (
    <div className="flex flex-col gap-5" data-testid="craft-budget-step">
      <div className="flex flex-col gap-3">
        <span className="text-ink text-[15px] font-medium">선호하는 예산을 입력하세요</span>
        <div className="border-ash/30 flex items-center justify-end gap-2 rounded-full border px-4 py-2.5">
          <div className="flex items-baseline gap-1">
            <input
              type="number"
              inputMode="numeric"
              min={MIN_BUDGET / STEP_BUDGET}
              max={MAX_BUDGET / STEP_BUDGET}
              step={1}
              value={manwonValue}
              data-testid="craft-budget-number-input"
              onChange={handleNumberInputChange}
              onBlur={handleNumberInputBlur}
              className="tnum w-20 [appearance:textfield] bg-transparent text-right text-[18px] font-medium outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-ash text-[13px]">만원</span>
          </div>
          <button
            type="button"
            aria-label="예산 최소값으로 초기화"
            onClick={() => onChange(MIN_BUDGET)}
            data-testid="craft-budget-reset"
            className="bg-ash/15 text-ash flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] leading-none"
          >
            ×
          </button>
        </div>
        <ElasticSlider
          dataTestId="craft-budget-slider"
          className="px-1"
          startingValue={MIN_BUDGET}
          value={value}
          maxValue={MAX_BUDGET}
          isStepped
          stepSize={STEP_BUDGET}
          onChange={onChange}
          showValueLabel={false}
          leftIcon={<span className="tnum">3만원</span>}
          rightIcon={<span className="tnum">300만원+</span>}
        />
        <div
          className="flex flex-col gap-2.5 px-1"
          role="radiogroup"
          aria-label="예산 구간 빠른 선택"
          data-testid="craft-budget-quick-select"
        >
          {BUDGET_TIERS.map((budgetTier, index) => {
            const isSelected = tier === budgetTier;
            const band = BUDGET_BANDS[index];
            // 만원 입력칸이 정수 만원만 표시하므로, 대표값도 10,000원(1만원) 배수로 맞춘다.
            const representativeValue =
              Math.round((band.start + band.end) / 2 / STEP_BUDGET) * STEP_BUDGET;
            return (
              <button
                key={budgetTier.title}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onChange(representativeValue)}
                className="flex items-center gap-2 text-left"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    isSelected ? 'border-primary-600' : 'border-ash/50'
                  }`}
                >
                  {isSelected && <span className="bg-primary-600 h-2 w-2 rounded-full" />}
                </span>
                <span className={`text-[13px] ${isSelected ? 'text-ink font-medium' : 'text-ash'}`}>
                  {budgetTier.rangeLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="bg-primary-50 flex flex-col gap-2 rounded-xl p-4"
        data-testid="craft-budget-tier"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink text-[16px] font-semibold">
            <span className="text-primary-600">{tier.titleAccent}</span>
            {tier.title.slice(tier.titleAccent.length)}
          </span>
          <span className="text-primary-700 tnum text-[13px] font-medium">{tier.rangeLabel}</span>
        </div>
        <p className="text-ash text-[13px]">{tier.target}</p>
        <ul className="text-ink flex flex-col gap-1 text-[14px]">
          {tier.items.map((item) => (
            <li key={item} className="flex gap-1.5">
              <span className="text-primary-600" aria-hidden="true">
                ·
              </span>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-ash text-[12px]">{tier.feature}</p>
      </div>
    </div>
  );
};

export default CraftBudgetStep;
