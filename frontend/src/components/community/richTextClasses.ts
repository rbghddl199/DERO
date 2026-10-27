// 커뮤니티 본문 리치 텍스트의 고정 팔레트 — 색상·정렬은 여기 이름만 serializeEditorContent(직렬화),
// PostRichEditorToolbar(에디터 UI), PostContent(rehype-sanitize 허용 목록)가 공유한다.
// 이름을 바꾸거나 값을 추가/삭제하면 세 곳 모두 함께 확인할 것 — globals.css의 실제 스타일도 같은 이름이어야 한다.

export type TextColorPreset = {
  label: string;
  hex: string;
  className: string;
};

export const TEXT_COLOR_PRESETS: readonly TextColorPreset[] = [
  { label: '빨강', hex: '#ef4444', className: 'text-color-red' },
  { label: '주황', hex: '#e8722c', className: 'text-color-orange' },
  { label: '초록', hex: '#22c55e', className: 'text-color-green' },
  { label: '파랑', hex: '#2563eb', className: 'text-color-blue' },
  { label: '보라', hex: '#9333ea', className: 'text-color-purple' },
];

export const TEXT_COLOR_CLASS_NAMES: readonly string[] = TEXT_COLOR_PRESETS.map((p) => p.className);

/** 정렬 클래스는 center/right만 존재한다 — left는 기본 블록 흐름이라 클래스를 붙이지 않는다 */
export const TEXT_ALIGN_CLASS_NAMES = ['text-align-center', 'text-align-right'] as const;
