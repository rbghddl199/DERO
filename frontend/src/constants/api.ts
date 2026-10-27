// API base URL 상수 — 로컬 백엔드(localhost:8080)를 기본값으로 쓰고 배포 환경은 env로 덮는다.

// 브라우저가 쓰는 오리진. 배포에서는 빈 문자열이라 모든 호출이 상대 경로 = 항상 동일 오리진이다.
// 절대 도메인을 박으면 호스트가 하나 늘어나는 순간(2026-08-03 apex A 레코드) 페이지 오리진과
// 어긋나 CORS preflight에서 전멸한다 — 백엔드는 동일 오리진 전제로 CORS를 닫아 뒀다(ADR-0005).
// /api/oauth2/authorization/{provider} 등 /api/v1 밖의 Spring Security 엔드포인트가 이 오리진을 쓴다.
// 그 엔드포인트도 /api/ 아래다 — nginx가 백엔드로 넘기는 접두사가 /api/뿐이라(ADR-0005 결정 11).
export const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

// RSC(Node)는 상대 경로를 못 받는다 — 서버 렌더에서만 절대 오리진이 필요하다. 배포에서는
// 컨테이너 내부로 직행해 nginx·TLS·공인 DNS를 거치지 않는다. NEXT_PUBLIC_ 접두사가 없어
// 브라우저 번들에서는 undefined로 인라인되고, 그때는 API_ORIGIN으로 떨어진다.
const SERVER_ORIGIN = process.env.INTERNAL_API_ORIGIN ?? API_ORIGIN;

// ADR-0008: URL 버전 접두사 /api/v1
export const API_BASE_URL = `${typeof window === 'undefined' ? SERVER_ORIGIN : API_ORIGIN}/api/v1`;

// 목업 ↔ 실제 API 전역 스위치 — 기본 mock(백엔드 없이도 동작), 'real'로만 실제 호출 전환.
// 이미 실제로만 동작하는 도메인(auth·placement)은 mock 분기가 없어 이 값을 참조하지 않는다.
export const API_MODE: 'mock' | 'real' =
  process.env.NEXT_PUBLIC_API_MODE === 'real' ? 'real' : 'mock';

export const isMockApi = (): boolean => API_MODE === 'mock';
