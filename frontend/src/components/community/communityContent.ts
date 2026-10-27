// 게시물 본문 관련 유틸 — 배치 임베드 토큰 파싱, 카드 미리보기용 평문 추출, 표지 이미지 추출,
// 작성 시각 문자열 생성.

/**
 * 본문에 꽂힌 배치 임베드 토큰(ADR-0013 결정 1). 본문에 들어가는 임베드는 이 종류 하나뿐이라
 * `PostContent.tsx`의 "짝수 인덱스=마크다운, 홀수 인덱스=임베드" 번갈아 규약이 그대로 성립한다.
 * (`String.prototype.split`·`matchAll`은 원본 정규식의 lastIndex를 건드리지 않으므로 모듈 상수로 둔다.)
 */
export const PLACEMENT_TOKEN_PATTERN = /\[\[placement:(\d+)\]\]/g;

export function buildPlacementToken(placementId: number): string {
  return `[[placement:${placementId}]]`;
}

/** 짝수 인덱스는 마크다운 조각, 홀수 인덱스는 배치 id 문자열이다 */
export function splitContentByPlacementTokens(content: string): string[] {
  return content.split(PLACEMENT_TOKEN_PATTERN);
}

/** 본문이 참조하는 배치 id — 중복은 지운다. 이걸 `listPlacements({ ids })`에 한 번에 넘긴다 */
export function extractPlacementIds(content: string): number[] {
  const ids = [...content.matchAll(PLACEMENT_TOKEN_PATTERN)].map((match) => Number(match[1]));
  return [...new Set(ids)];
}

/**
 * 본문·댓글에 박힌 멘션 토큰(D35·ADR-0038 결정 1). 백엔드 `UserMentionTokens`가 같은 정규식을
 * 들고 있으므로 **패턴을 바꾸면 둘 다 바꾼다**.
 *
 * **배치 토큰과 달리 인라인이다** — 문장 중간에 박히므로 `PostContent`의 "짝수=마크다운,
 * 홀수=임베드" 번갈아 규약을 쓸 수 없다. 본문은 렌더 전에 마크다운 링크로 치환하고
 * (`resolveMentions`), 마크다운이 아닌 평문(댓글)은 `MentionText`가 조각내 그린다.
 *
 * id는 양수 숫자만 받는다 — 그래야 토큰이 아닌 `@문자열`(이메일 주소 등)과 확실히 갈린다.
 */
export const USER_MENTION_TOKEN_PATTERN = /\[\[user:(\d{1,18})\]\]/g;

export function buildMentionToken(userId: number): string {
  return `[[user:${userId}]]`;
}

/** 짝수 인덱스는 평문 조각, 홀수 인덱스는 사용자 id 문자열이다 */
export function splitContentByMentionTokens(content: string): string[] {
  return content.split(USER_MENTION_TOKEN_PATTERN);
}

/** 링크에 붙는 닉네임이 마크다운·HTML로 해석되지 않게 막는다 — `rehype-raw`가 켜져 있어 `<`·`>`도 대상이다 */
const escapeMentionLabel = (nickname: string): string =>
  nickname.replace(/([\\*_`[\]<>()])/g, '\\$1');

/** 프로필로 가는 경로 — 멘션과 작성자 닉네임이 같은 목적지를 쓴다 */
export function userProfileHref(userId: number): string {
  return `/users/${userId}`;
}

/** 해석되지 않은 멘션(탈퇴·부재 사용자)이 쓰는 문구. 링크를 걸지 않는 것이 이 값의 짝이다 */
export const UNKNOWN_MENTION_LABEL = '@알 수 없음';

/**
 * 멘션 토큰을 **마크다운 링크**로 바꾼 본문을 돌려준다 — `PostContent`에 넘기기 전에 한 번 통과시킨다.
 *
 * 토큰은 문장 중간에 박히는 인라인이라 배치 임베드처럼 조각내 컴포넌트로 끼울 수 없다. 대신 렌더
 * 직전에 `[@닉네임](/users/12)`로 바꾸면 기존 마크다운 파이프라인이 그대로 링크를 그린다.
 * **해석표에 없는 id는 "@알 수 없음" 평문**이다 — 서버가 탈퇴·부재 사용자를 목록에서 빼므로
 * 폴백 조건이 하나다(ADR-0038 결정 4).
 */
export function resolveMentions(
  content: string,
  // 배포 롤링 중(멘션 이전 백엔드)엔 필드 자체가 없을 수 있다 — 서버 렌더가 통째로 죽는 것보다
  // 토큰이 "@알 수 없음"으로 보이는 편이 낫다.
  mentions: readonly { userId: number; nickname: string }[] | undefined,
): string {
  if (content === '') return content;
  const byId = new Map((mentions ?? []).map((mention) => [mention.userId, mention.nickname]));
  return content.replace(USER_MENTION_TOKEN_PATTERN, (_match, id: string) => {
    const nickname = byId.get(Number(id));
    return nickname === undefined
      ? UNKNOWN_MENTION_LABEL
      : `[@${escapeMentionLabel(nickname)}](${userProfileHref(Number(id))})`;
  });
}

/** 본문에 삽입된 첫 이미지 URL(마크다운 `![alt](src)`) — 없으면 undefined. 목록 카드 표지 폴백으로 쓴다 */
export function extractFirstImageUrl(content: string): string | undefined {
  return content.match(/!\[[^\]]*\]\(([^)\s]+)\)/)?.[1];
}

/** 이 src(imageKey 또는 blob 미리보기 주소)를 가리키는 이미지 마크다운을 본문에서 전부 뗀다.
 *
 *  src는 정규식 메타문자(`.`·`+` 등)를 담을 수 있어 **반드시 이스케이프한다** — 안 하면 `.`이
 *  임의 문자와 매치돼 엉뚱한 사진 줄까지 지운다.
 *  (데스크피드·커뮤니티 수정 화면이 함께 쓴다 — 사진을 지울 때 본문에서도 떼지 않으면 본문에
 *  죽은 key가 남거나 DB에 고아 사진이 남는다.) */
export function removeImageMarkdown(content: string, src: string): string {
  const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content.replace(new RegExp(`!\\[[^\\]]*\\]\\(${escaped}\\)\\n?`, 'g'), '');
}

/** 파일명을 이미지 alt로 쓸 때 쓰는 살균 — `[`·`]`·`(`·`)`가 들어가면 마크다운 이미지 패턴이
 *  깨져서(FE `extractImageKeys`·`parseEditorContent`·BE `DeskFeedContentImages`가 같은 모양을
 *  본다) 그 사진이 장수에도 안 세지고, 렌더도 안 되고, `removeImageMarkdown`으로 지워지지도 않고,
 *  수정 화면을 한 번 거치면 본문에서 통째로 사라진다. 사진을 꽂는 모든 경로가 반드시 통과할 것. */
export function toImageAlt(fileName: string): string {
  return fileName.replace(/[[\]()]/g, '');
}

/** 마크다운 기호를 지운 평문 전체 — 카드 미리보기가 쓴다 */
function toPlainText(content: string): string {
  return (
    content
      // 배치 임베드 토큰은 카드로 그려질 자리라 미리보기 문장에서는 통째로 지운다. 뒤의 대괄호
      // 처리보다 먼저 와야 `[[placement:12]]`가 링크 문법으로 오인되지 않는다.
      .replace(PLACEMENT_TOKEN_PATTERN, ' ')
      // 이미지는 미리보기에 그림으로 뜨지 않는데 alt(=업로드한 파일명)만 문장에 섞여 들어온다 —
      // 통째로 지운다. 아래 기호 제거(`_`·`-`)가 파일명 안의 문자를 먼저 갉아먹으면 이 패턴이
      // 안 맞으므로 반드시 그보다 먼저 와야 한다.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      // 밑줄·글자색·정렬은 <u>, <span class="...">, <p class="...">로 저장된다(PostRichEditor의
      // serializeEditorContent 참고) — 태그 껍데기만 지우고 안쪽 텍스트는 남긴다.
      .replace(/<\/?(u|span|p)(?:\s+[^<>]*)?>/gi, ' ')
      .replace(/[#*_`>~-]/g, ' ')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** 카드 미리보기용 — 마크다운 기호를 지운 평문 일부만 남긴다 */
export function toPlainExcerpt(content: string, maxLength: number): string {
  const plain = toPlainText(content);
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain;
}

/** 지금 이 순간의 ISO 8601 문자열 — 댓글 작성이 createdAt에 그대로 쓴다(백엔드 Date 직렬화와
 *  같은 형태로 맞춰둔다 — 표시할 땐 `formatRelativeTime`을 거친다). '오늘 날짜'라 결정성 규칙 대상 아님 */
export function nowIsoString(): string {
  return new Date().toISOString();
}
