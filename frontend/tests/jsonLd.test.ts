// JSON-LD 직렬화 — `</script>`가 그대로 나가면 저장형 XSS다(사용자 본문이 그대로 실리는 자리라
// 이 함정이 이론이 아니다). JSON.stringify는 `<`를 이스케이프하지 않는다.
import { describe, expect, it } from 'vitest';
import { toJsonLdScript } from '@/utils/jsonLd';

describe('toJsonLdScript', () => {
  it('`<`를 이스케이프해 스크립트 블록이 닫히지 않는다', () => {
    const json = toJsonLdScript({ articleBody: '</script><img src=x onerror=alert(1)>' });

    expect(json).not.toContain('</script>');
    expect(json).not.toContain('<img');
    // 값 자체는 보존된다 — 이스케이프는 표기만 바꾼다.
    expect(JSON.parse(json).articleBody).toBe('</script><img src=x onerror=alert(1)>');
  });
});
