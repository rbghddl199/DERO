// 데스크피드 갤러리 상단 해시태그 칩의 순서와 노출 상한 — DOM을 모르는 순수 함수(테스트가 여기 붙는다).
// 순서는 **등장 글 수 내림차순**이다: ㄱㄴㄷ 순은 신호가 없어 칩 40여 개가 같은 무게로 늘어섰다.
// 상한이 있는 이유는 무한 스크롤이다 — 페이지가 붙을 때마다 태그가 추가돼 칩 줄이 3줄에서 5줄로
// 자라며 갤러리를 아래로 밀었다(레이아웃 시프트). 상한이 그 성장을 잘라 높이를 고정한다.

/** 칩 줄에 한 번에 보여 줄 태그 수 — 2줄(데스크톱 기준)에서 끊긴다. 나머지는 접기 토글 뒤로. */
export const DESK_FEED_CHIP_LIMIT = 12;

/** 태그별 등장 글 수를 받아 칩 순서를 정한다. 동률은 ㄱㄴㄷ으로 갈라 순서가 흔들리지 않게 한다. */
export const rankHashtags = (counts: Map<string, number>): string[] =>
  [...counts.entries()]
    .sort(([tagA, countA], [tagB, countB]) => countB - countA || tagA.localeCompare(tagB, 'ko'))
    .map(([tag]) => tag);
