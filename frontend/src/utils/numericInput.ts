// 편집 중인 숫자 입력 문자열을 커밋 값으로 바꾼다 — 커밋할 수 없는 입력은 null이다.

/**
 * 편집 문자열 → 클램프된 값. 커밋하면 안 되는 입력(빈 문자열·`-`·문자)은 `null`이다.
 *
 * **`Number('')=== 0`이 이 함수가 있는 이유다.** 유한값 검사만 하면 값을 지우는 순간 0이
 * 통과해 최소값으로 튀고, 사용자는 지우고 다시 칠 수가 없다 — 선택 툴바가 2026-08-03에,
 * 벽 거리 입력이 DERO-552에서 같은 함정에 빠졌다. 커밋 지점이 하나여야 세 번째가 없다.
 */
export function commitDraft(draft: string, min: number, max: number): number | null {
  if (draft.trim() === '') return null;
  const parsed = Number(draft);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(parsed, min), max);
}
