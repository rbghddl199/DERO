'use client';
// 새 데스크테리어 마법사 1단계 — 책상 선택(제품 또는 직접 입력). 카드 클릭은 여기서 다음
// 단계로 넘기지 않고 선택 상태만 부모(CraftNewWizard)에 올린다 — 다음 단계 이동은
// Stepper(공용 컴포넌트)의 "다음" 버튼이 canProceed(선택 여부)로 게이트하며 담당한다.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getDeskTemplates, getDeskTextures } from '@/api/product';
import RemoteImage from '@/components/common/RemoteImage';
import { PRODUCT_ID_TO_THUMBNAIL } from '@/constants/deskTexture';
import type { DeskTexturePublicResponse } from '@/types/catalog';
import type { DeskSummaryResponse } from '@/types/product';
import CraftDeskPreview from './CraftDeskPreview';
import {
  DEFAULT_CUSTOM_DESK,
  DESK_FRAME_TYPES,
  DESK_RANGE,
  deskSkinForTextureId,
  deskTextureSkin,
  validateCustomDesk,
  type DeskConfig,
  type DeskDimError,
  type DeskFrameType,
} from '@/three/core/deskConfig';

export type DeskSelection =
  | { source: 'product'; productId: number; config: DeskConfig }
  | { source: 'custom'; config: DeskConfig };

// CraftNewWizard.FRAME_TYPE_TO_BACKEND의 역방향.
const BACKEND_FRAME_TYPE_TO_LOCAL: Record<DeskSummaryResponse['frameType'], DeskFrameType> = {
  T_FRAME: 't-frame',
  FOUR_LEG: 'four-leg',
  TOP_ONLY: 'top-only',
};

/** 재질은 `GET /desk-textures` 응답에서 스킨을 만들어 싣는다 — 시딩 2행 밖의 재질도 그대로
 *  렌더된다(DERO-335, 옛 DESK_TEXTURE_ID_TO_MATERIAL 임시표를 대체). materialId는 스킨이
 *  있으면 무시되는 폴백 자리라 기본값을 그대로 둔다. */
function deskConfigFromSummary(
  d: DeskSummaryResponse,
  textures: DeskTexturePublicResponse[],
): DeskConfig {
  return {
    source: 'product',
    productId: String(d.id),
    widthMm: d.widthMm,
    depthMm: d.depthMm,
    heightMm: d.heightMm,
    topThicknessMm: d.topThicknessMm,
    edgeThicknessMm: d.edgeThicknessMm,
    materialId: DEFAULT_CUSTOM_DESK.materialId,
    deskTextureId: d.deskTextureId,
    materialSkin: deskSkinForTextureId(textures, d.deskTextureId),
    frameType: BACKEND_FRAME_TYPE_TO_LOCAL[d.frameType],
  };
}

export type PickerMode = 'custom' | 'template' | null;

export type CraftDeskPickerHandle = {
  /** "선택 방식 다시 고르기"와 같은 동작 — 브라우저 뒤로가기를 스텝 내부 이동으로 처리하고
   *  싶은 호출부용(2026-08-06, CraftNewWizard의 히스토리 가드). */
  resetToModeSelect: () => void;
};

type Props = {
  value: DeskSelection | null;
  onChange: (selection: DeskSelection | null) => void;
  /** "직접 입력" 규격 폼이 펼쳐졌는지 — Stepper의 "다음" 버튼을 숨길지 부모(CraftNewWizard)가
   *  판단해야 해서 로컬 state가 아니라 controlled prop으로 끌어올렸다. */
  customFormOpen: boolean;
  onCustomFormOpenChange: (open: boolean) => void;
  /** 규격 적용이 유효성 검증을 통과해 실제로 반영된 직후 호출 — 다음 스텝으로 자동 진행시킨다. */
  onApplied: () => void;
  /** pickerMode가 바뀔 때마다 알린다 — 부모(CraftNewWizard)가 브라우저 뒤로가기를 "선택 방식
   *  다시 고르기"로 되돌릴지, 진짜로 페이지를 떠날지 판단하는 데 쓴다(2026-08-06). */
  onModeChange?: (mode: PickerMode) => void;
};

const DIM_KEYS = ['widthMm', 'depthMm', 'heightMm', 'topThicknessMm'] as const;
type DimKey = (typeof DIM_KEYS)[number];
const DIM_LABELS: Record<DimKey, string> = {
  widthMm: '너비',
  depthMm: '깊이',
  heightMm: '높이',
  topThicknessMm: '상판 두께',
};
// 각 입력란 라벨 바로 아래 표시되므로 필드명은 반복하지 않는다.
function formatDimError(e: DeskDimError): string {
  const belowMin = !Number.isFinite(e.value) || e.value < e.min;
  return belowMin ? `${e.min} 이상이어야 합니다.` : `${e.max} 이하여야 합니다.`;
}

const FRAME_LABELS: Record<DeskFrameType, string> = {
  't-frame': 'T프레임',
  'four-leg': '다리 4개',
  'top-only': '상판만',
};

const DESK_OPTIONS_PER_PAGE = 6;
const KRW_FORMATTER = new Intl.NumberFormat('ko-KR');

const CraftDeskPicker = forwardRef<CraftDeskPickerHandle, Props>(function CraftDeskPicker(
  { value, onChange, customFormOpen, onCustomFormOpenChange, onApplied, onModeChange },
  ref,
) {
  const [dims, setDims] = useState<Record<DimKey, number>>({
    widthMm: DESK_RANGE.widthMm.default,
    depthMm: DESK_RANGE.depthMm.default,
    heightMm: DESK_RANGE.heightMm.default,
    topThicknessMm: DESK_RANGE.topThicknessMm.default,
  });
  // 사용자가 실제로 고른 재질 id. null이면 아직 안 골랐다는 뜻이고 목록의 첫 재질이 선택된
  // 것으로 친다(아래 selectedTexture) — 목록 도착 시점에 setState하면 렌더 중 상태 조정이 되므로
  // 파생값으로 계산한다(hooks.md "derived state는 렌더 중 계산").
  const [deskTextureId, setDeskTextureId] = useState<number | null>(null);
  const [frameType, setFrameType] = useState<DeskFrameType>(DEFAULT_CUSTOM_DESK.frameType);
  const [dimErrors, setDimErrors] = useState<Partial<Record<DimKey, string>>>({});
  const [templates, setTemplates] = useState<DeskSummaryResponse[] | null>(null);
  const [textures, setTextures] = useState<DeskTexturePublicResponse[]>([]);
  const [templatePage, setTemplatePage] = useState(1);
  const [templateQuery, setTemplateQuery] = useState('');
  const [pickerMode, setPickerMode] = useState<PickerMode>(() => {
    if (value?.source === 'product') return 'template';
    if (value?.source === 'custom' || customFormOpen) return 'custom';
    return null;
  });
  const [pendingPickerMode, setPendingPickerMode] = useState<Exclude<PickerMode, null> | null>(
    null,
  );
  const customFormRef = useRef<HTMLDivElement | null>(null);
  const templateListTopRef = useRef<HTMLDivElement | null>(null);

  // 책상 템플릿 목록(REQ-ENV-01 제품 모드) — 실패해도 "직접 입력"은 항상 쓸 수 있어야 하므로
  // 빈 배열로 폴백한다.
  useEffect(() => {
    let cancelled = false;
    getDeskTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch((error) => {
        console.error('[CraftDeskPicker] 책상 템플릿을 불러오지 못했습니다', error);
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 책상 재질 마스터(`GET /desk-textures`) — 재질 선택지와 미리보기 스킨의 정본이다.
  // 템플릿 목록과 독립적으로 실패할 수 있으므로 별도 요청이고, 실패하면 빈 목록으로 떨어져
  // 재질 선택만 비활성화된다("직접 입력"은 항상 쓸 수 있어야 한다는 위 원칙과 같은 이유).
  useEffect(() => {
    let cancelled = false;
    getDeskTextures()
      .then((data) => {
        if (cancelled) return;
        setTextures([...data].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id));
      })
      .catch((error) => {
        console.error('[CraftDeskPicker] 책상 재질 목록을 불러오지 못했습니다', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 폼은 customFormOpen이 true가 될 때 새로 마운트되므로, 클릭 핸들러 안에서 바로
  // scrollIntoView하면 그 시점엔 아직 DOM에 없다 — 커밋 후 이 effect에서 스크롤한다.
  // block:'center'로 폼이 화면 정중앙에 오도록 한다. Stepper의 콘텐츠 래퍼는 이 폼이
  // 늘어난 만큼 높이를 스프링 애니메이션으로 뒤늦게 따라가므로, 너무 일찍 스크롤하면
  // 문서가 아직 다 안 늘어나 있어 목표 위치까지 스크롤할 여백이 없다(브라우저가 clamp해
  // 아무 반응이 없는 것처럼 보임). 고정 딜레이로 기다리면 필요 이상으로 늦게 시작돼
  // 굼떠 보이므로, 매 프레임 "지금 스크롤 가능한가"만 확인하다 가능해지자마자 바로 쏜다.
  useEffect(() => {
    if (!customFormOpen) return;
    let rafId: number;
    const MAX_ATTEMPTS = 60; // 안전망 — 60프레임(~1초) 지나면 포기하고 그냥 시도
    let attempts = 0;

    const tryScroll = (): void => {
      const el = customFormRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const targetScrollY = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
      const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
      attempts += 1;
      if (targetScrollY <= maxScrollY + 1 || attempts >= MAX_ATTEMPTS) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      rafId = requestAnimationFrame(tryScroll);
    };

    rafId = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(rafId);
  }, [customFormOpen]);

  // 아직 안 골랐으면 목록의 첫 재질이 선택된 것으로 친다 — 목록이 비면(로드 실패) undefined다.
  const selectedTexture = textures.find((t) => t.id === deskTextureId) ?? textures[0];
  // 스킨은 매 렌더 새 객체가 되면 안 된다 — CraftDeskPreviewScene의 useMemo dep이라
  // 참조가 바뀔 때마다 책상 Group을 통째로 다시 짓고 이전 것을 dispose한다.
  const selectedSkin = useMemo(
    () => (selectedTexture ? deskTextureSkin(selectedTexture) : undefined),
    [selectedTexture],
  );

  // 선택 방식 화면에서 직접 입력을 분리했으므로 제품 책상만 페이지당 6개씩 자른다.
  const normalizedTemplateQuery = templateQuery.trim().toLowerCase();
  const templateList = (templates ?? []).filter(
    (desk) =>
      normalizedTemplateQuery.length === 0 ||
      desk.name.toLowerCase().includes(normalizedTemplateQuery),
  );
  const templatePageCount = Math.max(1, Math.ceil(templateList.length / DESK_OPTIONS_PER_PAGE));
  const currentTemplatePage = Math.min(templatePage, templatePageCount);
  const firstOptionIndex = (currentTemplatePage - 1) * DESK_OPTIONS_PER_PAGE;
  const visibleTemplates = templateList.slice(
    firstOptionIndex,
    firstOptionIndex + DESK_OPTIONS_PER_PAGE,
  );

  const handleCustomSubmit = (): void => {
    const config: DeskConfig = {
      source: 'custom',
      widthMm: dims.widthMm,
      depthMm: dims.depthMm,
      heightMm: dims.heightMm,
      topThicknessMm: dims.topThicknessMm,
      // 재질 목록을 못 받았으면 materialId 폴백(기본 오크)만 남는다.
      materialId: DEFAULT_CUSTOM_DESK.materialId,
      deskTextureId: selectedTexture?.id,
      materialSkin: selectedSkin,
      frameType,
    };
    const v = validateCustomDesk(config);
    if (!v.ok) {
      const next: Partial<Record<DimKey, string>> = {};
      for (const e of v.errors) next[e.key] = formatDimError(e);
      setDimErrors(next);
      return;
    }
    setDimErrors({});
    onChange({ source: 'custom', config });
    onApplied();
  };

  const hasSelection = value !== null;
  const templateNextRef = useRef<HTMLDivElement>(null);
  // 브라우저는 더블클릭 앞에 click을 두 번 먼저 쏜다 — 그 두 click이 각자 예약한
  // scrollIntoView(다음 버튼, block:'end')가 더블클릭의 onApplied(맨 위로 스크롤) 뒤에
  // 실행되면서 맨 위 스크롤을 도로 덮어썼다(2026-08-06 사용자 리포트). 예약된 프레임을
  // 들고 있다가 더블클릭이 오면 취소한다.
  const revealNextFrameRef = useRef<number | null>(null);

  const cancelRevealNext = (): void => {
    if (revealNextFrameRef.current !== null) {
      cancelAnimationFrame(revealNextFrameRef.current);
      revealNextFrameRef.current = null;
    }
  };

  const selectTemplate = (desk: DeskSummaryResponse): void => {
    onCustomFormOpenChange(false);
    onChange({
      source: 'product',
      productId: desk.id,
      config: deskConfigFromSummary(desk, textures),
    });
  };

  const selectTemplateAndRevealNext = (desk: DeskSummaryResponse): void => {
    selectTemplate(desk);
    cancelRevealNext();
    revealNextFrameRef.current = requestAnimationFrame(() => {
      revealNextFrameRef.current = null;
      templateNextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  };

  const enterPickerMode = (mode: Exclude<PickerMode, null>): void => {
    setPendingPickerMode(mode);
    setPickerMode(mode);
    setTemplatePage(1);
    onCustomFormOpenChange(mode === 'custom');
    if (mode === 'custom' && value?.source === 'product') onChange(null);
    if (mode === 'template' && value?.source === 'custom') onChange(null);
  };

  const resetToModeSelect = useCallback((): void => {
    setPickerMode(null);
    setPendingPickerMode(null);
    onCustomFormOpenChange(false);
    onChange(null);
  }, [onCustomFormOpenChange, onChange]);

  useImperativeHandle(ref, () => ({ resetToModeSelect }), [resetToModeSelect]);

  // 부모(CraftNewWizard)가 브라우저 뒤로가기 시 "지금 이 스텝 안에서 한 단계 더 되돌릴 자리가
  // 있는지"를 판단하려면 pickerMode를 알아야 한다 — 로컬 state라 끌어올리는 대신 변경만 알린다.
  useEffect(() => {
    onModeChange?.(pickerMode);
  }, [pickerMode, onModeChange]);

  // 선택 글로우(box-shadow)의 최대 번짐(blur+spread)은 Stepper의 좌우 버퍼
  // (CONTENT_HORIZONTAL_PADDING_PX, 40px)보다 작아야 한다 — 넘으면 그리드 맨 왼쪽/오른쪽
  // 카드의 글로우가 그 경계에서 잘린다(2026-07-28).
  return (
    <div>
      {pickerMode === null && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              data-testid="craft-desk-mode-custom"
              aria-pressed={pendingPickerMode === 'custom'}
              onClick={() => setPendingPickerMode('custom')}
              onDoubleClick={() => enterPickerMode('custom')}
              className={`group flex min-h-[320px] flex-col gap-3 rounded-2xl border p-5 text-left transition-all duration-300 hover:-translate-y-1 ${
                pendingPickerMode === 'custom'
                  ? 'border-primary-400 bg-primary-50 shadow-[0_0_6px_1px_rgba(240,187,76,0.45),0_0_16px_5px_rgba(240,187,76,0.25)]'
                  : 'border-primary-300 bg-paper hover:border-primary-400 hover:shadow-[0_16px_40px_-20px_rgba(60,45,15,0.35)]'
              }`}
            >
              <div className="bg-primary-50 flex flex-1 items-center justify-center rounded-xl">
                <svg
                  viewBox="0 0 24 24"
                  className="text-ash h-24 w-24 transition-transform duration-300 group-hover:scale-105"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z" />
                  <path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2" />
                </svg>
              </div>
              <span className="text-ink text-[18px] font-semibold">직접 입력</span>
              <span className="text-ash text-[14px]">내 책상의 규격과 재질을 직접 입력합니다</span>
            </button>

            <button
              type="button"
              data-testid="craft-desk-mode-template"
              aria-pressed={pendingPickerMode === 'template'}
              onClick={() => setPendingPickerMode('template')}
              onDoubleClick={() => enterPickerMode('template')}
              className={`group flex min-h-[320px] flex-col gap-3 rounded-2xl border p-5 text-left transition-all duration-300 hover:-translate-y-1 ${
                pendingPickerMode === 'template'
                  ? 'border-primary-400 bg-primary-50 shadow-[0_0_6px_1px_rgba(240,187,76,0.45),0_0_16px_5px_rgba(240,187,76,0.25)]'
                  : 'border-primary-300 bg-paper hover:border-primary-400 hover:shadow-[0_16px_40px_-20px_rgba(60,45,15,0.35)]'
              }`}
            >
              <div className="bg-primary-50 flex flex-1 items-center justify-center rounded-xl">
                <svg
                  viewBox="0 0 24 24"
                  className="text-ash h-24 w-24 transition-transform duration-300 group-hover:scale-105"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 8h18v4H3z" />
                  <path d="M5 12v8M19 12v8" />
                  <path d="M8 8V5h8v3" />
                </svg>
              </div>
              <span className="text-ink text-[18px] font-semibold">책상 선택</span>
              <span className="text-ash text-[14px]">등록된 책상 제품 중 하나를 선택합니다</span>
            </button>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={pendingPickerMode === null}
              data-testid="craft-desk-mode-next"
              onClick={() => {
                if (pendingPickerMode) enterPickerMode(pendingPickerMode);
              }}
              className="bg-primary-200 hover:bg-primary-400 active:bg-primary-500 rounded-xl px-5 py-3 text-[15px] font-medium text-neutral-900 transition-colors disabled:pointer-events-none disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </>
      )}

      {pickerMode !== null && (
        <div className="mb-4 flex items-center justify-between gap-4">
          <button
            type="button"
            data-testid="craft-desk-mode-back"
            onClick={resetToModeSelect}
            className="border-ash/40 text-ash hover:border-primary-400 hover:text-ink rounded-full border px-4 py-2 text-[14px] font-medium transition-colors"
          >
            ← 선택 방식 다시 고르기
          </button>
        </div>
      )}

      {pickerMode === 'template' && (
        <>
          <div ref={templateListTopRef} className="scroll-mt-24">
            <label className="border-ash/40 mb-4 flex items-center gap-3 rounded-xl border bg-white px-4 py-3">
              <span className="sr-only">책상 검색</span>
              <svg
                viewBox="0 0 24 24"
                className="text-ash h-5 w-5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="M20 20l-4.35-4.35" />
              </svg>
              <input
                type="search"
                value={templateQuery}
                placeholder="책상 이름 검색"
                data-testid="craft-desk-search"
                onChange={(event) => {
                  setTemplateQuery(event.target.value);
                  setTemplatePage(1);
                }}
                className="text-ink placeholder:text-ash min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              />
            </label>
          </div>
          {visibleTemplates.length === 0 ? (
            <p className="text-ash py-16 text-center text-[15px]">검색 결과가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {visibleTemplates.map((d) => {
                const isSelected = value?.source === 'product' && value.productId === d.id;
                const isDimmed = !isSelected && hasSelection;
                // 실 카탈로그 대표 이미지를 우선한다 — 없으면(시딩 데스크 등) 정적 임시표로 폴백
                // (DERO-325, 위 imageUrl 필드 주석대로).
                const thumbnail = d.imageUrl ?? PRODUCT_ID_TO_THUMBNAIL[d.id];
                return (
                  <button
                    key={d.id}
                    type="button"
                    data-testid={`craft-desk-card-${d.id}`}
                    title="더블클릭하면 바로 선택됩니다"
                    onClick={() => selectTemplateAndRevealNext(d)}
                    onDoubleClick={() => {
                      // 더블클릭 앞의 두 click이 이미 예약해 둔 "다음 버튼으로 스크롤"을 취소한다 —
                      // 안 지우면 그 예약이 다음 프레임에 실행되며 아래 onApplied()의 맨 위 스크롤을
                      // 덮어써 더블클릭만 스크롤이 안 되는 것처럼 보인다.
                      cancelRevealNext();
                      selectTemplate(d);
                      onApplied();
                    }}
                    className={`group flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all duration-500 ease-out ${
                      isSelected
                        ? 'border-primary-400 bg-primary-50 z-10 shadow-[0_0_6px_1px_rgba(240,187,76,0.45),0_0_16px_5px_rgba(240,187,76,0.25),0_0_28px_8px_rgba(240,187,76,0.12)]'
                        : isDimmed
                          ? 'border-ash/20 bg-ash/10 opacity-60'
                          : 'border-primary-300 bg-paper hover:border-primary-400 hover:-translate-y-1 hover:shadow-[0_16px_40px_-20px_rgba(60,45,15,0.35)]'
                    }`}
                  >
                    <div
                      data-testid={`craft-desk-image-${d.id}`}
                      className={`aspect-square overflow-hidden rounded-xl transition-colors duration-500 ${
                        isSelected ? 'bg-primary-50' : isDimmed ? 'bg-ash/10' : 'bg-paper'
                      }`}
                    >
                      {thumbnail ? (
                        <RemoteImage
                          src={thumbnail}
                          alt={d.name}
                          width={240}
                          height={240}
                          sizes="(min-width: 640px) 240px, 45vw"
                          className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
                          draggable={false}
                        />
                      ) : (
                        <div className="text-ash flex h-full w-full items-center justify-center text-[13px]">
                          미리보기 없음
                        </div>
                      )}
                    </div>
                    <span className="text-ink text-[15px] font-medium">{d.name}</span>
                    {/* d.brand 조건이 있었으나(2026-07-29 제거) DeskSummaryResponse엔 그런 필드가 없다 —
                  이 목록은 `/products?specType=DESK`(카탈로그) 응답이라 여기 뜨는 항목은 전부 DERO 기본
                  템플릿이다(사용자가 만든 책상은 이 목록에 섞이지 않고 "직접 입력" 카드로 처리된다).
                  그래서 조건 없이 항상 보여준다 — 이전 로컬 카탈로그(three/scene/product.ts)의
                  brand 필드를 참조하던 죽은 코드였다. */}
                    <span className="text-ash text-[12px]">
                      DERO에서 제공하는 기본 템플릿이에요
                    </span>
                    <span className="text-ash tnum text-[13px]">
                      {d.widthMm} × {d.depthMm} × {d.heightMm} mm ·{' '}
                      {d.priceKrw == null ? '가격 미등록' : `${KRW_FORMATTER.format(d.priceKrw)}원`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {pickerMode === 'template' && templates !== null && templatePageCount > 1 && (
        <nav aria-label="책상 목록 페이지" className="mt-5 flex justify-center gap-2">
          {Array.from({ length: templatePageCount }, (_, index) => index + 1).map((page) => (
            <button
              key={page}
              type="button"
              aria-label={`${page}페이지`}
              aria-current={page === currentTemplatePage ? 'page' : undefined}
              data-testid={`craft-desk-page-${page}`}
              onClick={() => {
                setTemplatePage(page);
                templateListTopRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
              }}
              className={`flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-[14px] font-semibold transition-colors ${
                page === currentTemplatePage
                  ? 'bg-primary-400 text-ink'
                  : 'border-ash/30 bg-paper text-ash hover:border-primary-400 hover:text-ink border'
              }`}
            >
              {page}
            </button>
          ))}
        </nav>
      )}

      {pickerMode === 'template' && (
        <div ref={templateNextRef} className="mt-6 flex scroll-mb-6 justify-end">
          <button
            type="button"
            disabled={value?.source !== 'product'}
            data-testid="craft-desk-template-next"
            onClick={onApplied}
            className="bg-primary-200 hover:bg-primary-400 active:bg-primary-500 rounded-xl px-5 py-3 text-[15px] font-medium text-neutral-900 transition-colors disabled:pointer-events-none disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}

      {pickerMode === 'custom' && (
        <div
          ref={customFormRef}
          // scroll-mt-24 — 고정(sticky) 헤더 높이(64px)에 가리지 않도록 여유를 둔다
          className="border-ash/20 mt-4 flex scroll-mt-24 flex-col gap-4 rounded-2xl border bg-white p-6"
          data-testid="craft-desk-custom-form"
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <div className="aspect-square w-full shrink-0 overflow-hidden rounded-xl bg-neutral-100 md:w-64">
              <CraftDeskPreview
                widthMm={dims.widthMm}
                depthMm={dims.depthMm}
                heightMm={dims.heightMm}
                topThicknessMm={dims.topThicknessMm}
                materialSkin={selectedSkin}
                frameType={frameType}
              />
            </div>
            <div className="flex flex-1 flex-col gap-4">
              {DIM_KEYS.map((key) => {
                const r = DESK_RANGE[key];
                return (
                  <label key={key} className="flex flex-col gap-1">
                    <span className="text-ash text-[13px]">{DIM_LABELS[key]} (mm)</span>
                    <input
                      type="number"
                      min={r.min}
                      max={r.max}
                      step={r.step}
                      value={dims[key]}
                      data-testid={`craft-desk-input-${key}`}
                      onChange={(e) =>
                        setDims((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                      }
                      className="border-ash/40 tnum rounded-lg border px-3 py-2 text-[14px]"
                    />
                    {dimErrors[key] && (
                      <span
                        className="text-[12px] text-red-600"
                        data-testid={`craft-desk-input-${key}-error`}
                      >
                        {dimErrors[key]}
                      </span>
                    )}
                  </label>
                );
              })}
              {/* 재질 목록은 `GET /desk-textures` 마스터다 — 관리자가 재질을 추가하면 프론트 배포
                  없이 여기 뜬다(DERO-335). 못 받았으면 고를 것이 없어 비활성화한다. */}
              <label className="flex flex-col gap-1">
                <span className="text-ash text-[13px]">재질</span>
                <select
                  value={selectedTexture?.id ?? ''}
                  disabled={textures.length === 0}
                  data-testid="craft-desk-input-material"
                  onChange={(e) => setDeskTextureId(Number(e.target.value))}
                  className="border-ash/40 rounded-lg border px-3 py-2 text-[14px] disabled:opacity-60"
                >
                  {textures.length === 0 ? (
                    <option value="">재질을 불러오지 못했습니다</option>
                  ) : (
                    textures.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-ash text-[13px]">프레임</span>
                <select
                  value={frameType}
                  data-testid="craft-desk-input-frame"
                  onChange={(e) => setFrameType(e.target.value as DeskFrameType)}
                  className="border-ash/40 rounded-lg border px-3 py-2 text-[14px]"
                >
                  {DESK_FRAME_TYPES.map((id) => (
                    <option key={id} value={id}>
                      {FRAME_LABELS[id]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCustomSubmit}
            data-testid="craft-desk-custom-submit"
            className="bg-primary-200 hover:bg-primary-400 active:bg-primary-500 rounded-xl px-5 py-3 text-[15px] font-medium text-neutral-900 transition-colors"
          >
            {value?.source === 'custom' ? '이 규격 적용됨 — 다시 적용' : '이 규격 적용'}
          </button>
        </div>
      )}
    </div>
  );
});
CraftDeskPicker.displayName = 'CraftDeskPicker';

export default CraftDeskPicker;
