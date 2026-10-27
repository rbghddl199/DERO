// 검색 입력 → 서버에 실을 질의 문자열. '#'을 떼는 자리는 여기 한 곳이다.
//
// 선행 '#'은 태그 검색 표기일 뿐 저장된 태그명에는 없다(hashtag.name은 순수 문자열) — 그래서
// 프론트가 뗀다. **서버도 떼면 `##태그`가 깨지고, 양쪽 다 안 떼면 태그가 안 걸린다**(DERO-492).
// 하나만 떼는 이유는 그래서다: `#원목데스크`와 `원목데스크`는 같은 질의, `##태그`는 `#태그` 질의.

export function normalizeSearchQuery(input: string): string {
  return input.trim().replace(/^#/, '');
}
