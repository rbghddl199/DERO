// JSON-LD를 `<script>` 안에 안전하게 넣기 위한 직렬화.
//
// **`JSON.stringify`만으로는 부족하다** — `<`를 이스케이프하지 않아서, 사용자가 본문에
// `</script><img src=x onerror=...>`를 쓰면 그 문자열이 그대로 나가 스크립트 블록이 닫히고
// 뒤가 실제 마크업으로 파싱된다(저장형 XSS). 구조화 데이터는 사용자 본문을 그대로 싣는 자리라
// 이 함정이 바로 성립한다.
//
// 유니코드 이스케이프로 바꾼 `<`는 JSON 파서에게 원래 글자와 같은 값이라 구조화 데이터의 뜻이
// 변하지 않고, HTML 파서에는 태그 시작으로 보이지 않는다. `>`·`&`도 같은 이유로 함께 막는다
// (`<!--`·`-->` 같은 주석 경계도 이 셋 안에서 성립한다).

const HTML_UNSAFE = /[<>&]/g;

const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
};

/** `<script type="application/ld+json">`에 그대로 넣어도 되는 JSON 문자열. */
export function toJsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(HTML_UNSAFE, (char) => ESCAPES[char]);
}
