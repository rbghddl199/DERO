// 데스크피드 본문(마크다운) 조작 — 사진의 위치 정본이 본문이다(D32 개정·ADR-0034).
// 본문에서 이미지 마크다운을 떼는 `removeImageMarkdown`은 커뮤니티 수정 화면도 같이 쓰므로
// `components/community/communityContent.ts`에 있다.

/** 본문에 등장한 순서대로 이미지 key를 뽑는다 — 순서 정본은 본문이다(D34·ADR-0037).
 *
 *  백엔드 `DeskFeedContentImages`와 **같은 정규식이다** — 한쪽만 고치면 서버가 센 장수와 화면이
 *  그리는 장수가 갈린다. */
export function extractImageKeys(content: string): string[] {
  return Array.from(content.matchAll(/!\[[^\]]*\]\(([^)]*)\)/g), (match) => match[1]);
}

/** 본문 순서대로 정렬한 presigned GET URL — 레지스트리(`images`)는 등록 순서라 그대로 쓰면
 *  화면 순서가 본문과 어긋난다. 본문에 없는(고아) 사진은 뒤에 붙여 아예 사라지지 않게 한다. */
export function orderImageUrlsByContent(
  content: string,
  images: readonly { imageKey: string; imageUrl: string }[],
): string[] {
  const byKey = new Map(images.map((image) => [image.imageKey, image.imageUrl]));
  const ordered = extractImageKeys(content)
    .map((key) => byKey.get(key))
    .filter((url): url is string => url !== undefined);
  const seen = new Set(ordered);
  return [...ordered, ...images.map((image) => image.imageUrl).filter((url) => !seen.has(url))];
}
