// 브라우저 하드웨어(그래픽) 가속 상태 감지 — WebGL 렌더러 문자열로 소프트웨어 래스터라이저
// (SwiftShader·llvmpipe 등) 여부를 판별한다. 브라우저 보안 정책상 웹 페이지가 이 설정을 직접
// 읽거나 바꿀 수는 없으므로, "가속이 꺼진 결과"(소프트웨어 렌더링)를 관찰하는 것이 최선이다.
// 켜고 끄는 것도 마찬가지로 불가능해서, UI는 감지 결과 표시 + 브라우저별 설정 경로 안내까지만
// 한다(HardwareAccelDialog.tsx).

export type GpuAccelerationStatus = {
  /** true = 실제 GPU 가속 렌더링, false = 소프트웨어 렌더링(가속 꺼짐/차단) */
  accelerated: boolean;
  /** 감지에 쓴 원본 렌더러 문자열 — 안내 다이얼로그에 참고용으로 보여준다. */
  rendererLabel: string;
};

/** Chrome의 SwiftShader, Mesa의 llvmpipe/softpipe, Windows의 Microsoft Basic Render Driver 등
 *  대표적인 소프트웨어 래스터라이저 표식. 이 중 하나라도 있으면 가속이 꺼진 것으로 본다. */
const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/**
 * 1회용 WebGL 컨텍스트를 만들어 렌더러 문자열을 읽는다. 시뮬레이터 본체가 WebGPU로 돌아도
 * 하드웨어 가속 설정은 브라우저 전역이라 WebGL 프로브가 같은 결과를 반영한다(가속이 꺼지면
 * WebGPU는 아예 없고 WebGL은 SwiftShader로 떨어진다). WebGL 자체가 안 열리면 가속 꺼짐으로
 * 취급한다 — 실사용 관점에서 구분할 이유가 없다.
 */
export function detectGpuAcceleration(): GpuAccelerationStatus {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { accelerated: false, rendererLabel: 'WebGL 사용 불가' };

    // Chrome·Edge는 이 확장으로만 실제 렌더러명을 준다. Firefox는 확장이 없어도
    // getParameter(RENDERER)가 실명(소프트웨어면 llvmpipe)을 돌려준다.
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererLabel = String(
      debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    );
    // 프로브용 컨텍스트를 즉시 반납한다 — 브라우저의 동시 WebGL 컨텍스트 상한을 갉아먹지 않게.
    gl.getExtension('WEBGL_lose_context')?.loseContext();

    return { accelerated: !SOFTWARE_RENDERER_PATTERN.test(rendererLabel), rendererLabel };
  } catch {
    return { accelerated: false, rendererLabel: '감지 실패' };
  }
}

export type BrowserKind = 'chrome' | 'edge' | 'firefox' | 'other';

/** 안내 다이얼로그에서 "지금 쓰는 브라우저" 항목을 맨 앞에 세우기 위한 대략적 판별 —
 *  Edge UA엔 Chrome/도 같이 들어 있으므로 Edg/를 먼저 본다. 기능 분기가 아니라 안내
 *  순서용이라 이 정도 정밀도면 충분하다. */
export function detectBrowserKind(): BrowserKind {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua)) return 'chrome';
  return 'other';
}
