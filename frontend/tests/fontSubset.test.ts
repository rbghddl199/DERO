// 폰트를 통짜 PretendardVariable.woff2(2.0MB)로 되돌리면 콜드 전송이 6배로 뛰는데 화면은 똑같아
// 리뷰에서 안 보인다(DERO-607). 그래서 진입점의 폰트 배선을 테스트로 못박는다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const layout = readFileSync(join(root, 'src', 'app', 'layout.tsx'), 'utf8');
const globals = readFileSync(join(root, 'src', 'app', 'globals.css'), 'utf8');

describe('Pretendard dynamic-subset 배선', () => {
  it('루트 레이아웃이 dynamic-subset CSS를 import한다', () => {
    expect(layout).toContain('pretendardvariable-dynamic-subset.css');
  });

  it('통짜 variable woff2와 next/font를 쓰지 않는다', () => {
    expect(layout).not.toContain('woff2/PretendardVariable.woff2');
    expect(layout).not.toMatch(/from ['"]next\/font/);
  });

  it('--font-pretendard가 dynamic-subset이 정의하는 패밀리를 가리킨다', () => {
    expect(globals).toMatch(/--font-pretendard:\s*[\s\S]*?'Pretendard Variable'/);
  });
});
