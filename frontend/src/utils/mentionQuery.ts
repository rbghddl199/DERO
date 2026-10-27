// 커서 앞 텍스트에서 "지금 멘션을 치는 중인가"를 판정한다 — textarea든 Tiptap이든 판정 규칙은 같아야
// 하므로(입력기마다 다르면 이메일 주소가 한쪽에서만 자동완성을 띄운다) 순수 함수 한 곳에 둔다.

/** 자동완성이 열려 있는 상태. `start`는 `@`의 인덱스라 삽입 시 여기부터 커서까지를 토큰으로 바꾼다. */
export type MentionTrigger = {
  /** `@` 뒤에 지금까지 친 글자. 빈 문자열일 수 있다(`@`만 친 직후). */
  query: string;
  start: number;
};

/**
 * `@`는 **줄 시작이거나 공백·여는 괄호 뒤**일 때만 트리거다 — 그래야 `dero@example.com` 같은 이메일
 * 주소가 자동완성을 열지 않는다(스펙 User Story 13: 멘션이 아닌 `@`는 깨지지 않는다).
 *
 * 질의에 공백·`@`·괄호류를 넣지 않는 것은 닉네임이 그 문자를 못 쓰기 때문이 아니라, 넣으면 트리거가
 * 문장 끝까지 늘어붙어 커서가 멀어진 뒤에도 자동완성이 계속 열려 있기 때문이다. 20자에서 끊는 것도
 * 같은 이유다(닉네임 상한은 50자지만, 그만큼 치고도 안 걸리면 후보가 없는 것이다).
 */
// `￼`(object replacement character)는 Tiptap 쪽에서 이미지·배치·멘션 같은 atom 노드를 한 글자로
// 세어 넘길 때 들어온다 — 허용 접두에 없으면 Shift+Enter 직후나 칩 바로 뒤에서 `@`가 안 열린다.
const TRIGGER = /(?:^|[\s([{<>"'￼])@([^\s@[\]()]{0,20})$/;

export function findMentionTrigger(textBeforeCursor: string): MentionTrigger | null {
  const matched = TRIGGER.exec(textBeforeCursor);
  if (matched === null) return null;

  const query = matched[1];
  return { query, start: textBeforeCursor.length - query.length - 1 };
}
