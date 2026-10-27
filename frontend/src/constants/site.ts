// 사이트 정체성 상수 — 메타태그·구조화 데이터·sitemap이 쓰는 절대 주소와 이름(D34·ADR-0037 결정 4).
//
// **절대 오리진이 필요한 곳은 크롤러가 읽는 산출물뿐이다** — canonical·og:url·sitemap의 `<loc>`는
// 상대 경로를 허용하지 않는다. API 호출은 여전히 동일 오리진 상대 경로다(`constants/api.ts`의
// `API_ORIGIN`과 섞지 말 것: 그쪽은 백엔드 주소고 이쪽은 공개 웹 주소다).
//
// 배포 도메인이 바뀌면 `NEXT_PUBLIC_SITE_ORIGIN` 하나만 바꾼다. 기본값은 운영 도메인이다 —
// 로컬에서 sitemap을 열면 운영 주소가 나오는데, 그게 "검색엔진이 볼 값"이라 정직하다.

export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://www.dero.life';

export const SITE_NAME = '데스크테리어 시뮬레이터';
