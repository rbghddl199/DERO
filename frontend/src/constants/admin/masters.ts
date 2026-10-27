// 관리자 마스터 6종 화면이 공유하는 페이지 크기와 인라인 클래스 문자열.
// 공용 Button/Input 컴포넌트를 두지 않는 것이 이 저장소 관례라(frontend/CLAUDE.md) 클래스만 공유한다.

/** 마스터 목록 한 페이지 항목 수 — 6개 화면이 같은 값을 쓴다(page 번호는 0부터, Spring Pageable 기본). */
export const MASTER_PAGE_SIZE = 20;

export const MASTER_INPUT_CLASS =
  'bg-paper text-ink placeholder:text-ash border-ash/40 w-full rounded-[10px] border px-3 py-2 text-[15px] outline-none';

export const MASTER_INPUT_ERROR_CLASS =
  'bg-paper text-ink placeholder:text-ash border-danger-500 w-full rounded-[10px] border px-3 py-2 text-[15px] outline-none';

export const MASTER_PRIMARY_BUTTON_CLASS =
  'bg-ink text-paper hover:bg-ink/85 cursor-pointer rounded-[10px] px-4 py-2 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';

export const MASTER_GHOST_BUTTON_CLASS =
  'border-ash/30 text-ink hover:bg-fog cursor-pointer rounded-[10px] border px-3 py-1.5 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';

export const MASTER_DANGER_BUTTON_CLASS =
  'border-danger-500/40 text-danger-700 hover:bg-danger-50 cursor-pointer rounded-[10px] border px-3 py-1.5 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';

/** 관리자 화면은 도구 성격이라 <table>을 쓴다 — 숫자 열은 tabular-nums로 자릿수를 맞춘다. */
export const MASTER_TABLE_HEAD_CLASS =
  'text-ash border-ash/20 border-b px-3 py-2 text-left text-[13px] font-semibold';

export const MASTER_TABLE_CELL_CLASS = 'border-ash/10 text-ink border-b px-3 py-3 text-[14px]';
