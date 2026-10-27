# 아키스케치(Archisketch) 심층 분석

- 조사일: 2026-07-14
- 조사 방법: 공식 사이트·공식 문서(docs.archisketch.com)·공식 블로그·채용 공고·언론 인터뷰 등 1차 출처 중심 웹 조사
- 표기 원칙: 출처로 확인되지 않은 항목은 **미확인**으로 표기. 추정은 "추정"으로 명시

## 0. 회사 개요

- 법인명 (주)아키스케치. 구 사명은 **아키드로우(Archidraw)** — 2022~2023년 언론 기사는 아키드로우 명의로 보도됨 ([대한경제](https://www.dnews.co.kr/uhtml/view.jsp?idxno=202303171502371530530), [테크42 인터뷰](https://www.tech42.co.kr/%EC%9D%B8%ED%84%B0%EB%B7%B0-%EC%9D%B4%EC%A3%BC%EC%84%B1-%EC%95%84%ED%82%A4%EB%93%9C%EB%A1%9C%EC%9A%B0-%EB%8C%80%ED%91%9C-%EC%98%A8%EB%9D%BC%EC%9D%B8-3d-%EC%9D%B8%ED%85%8C%EB%A6%AC%EC%96%B4/)). 2014년 설립, 대표 이주성 ([THE VC](https://thevc.kr/archisketch), [archisketch.com](https://www.archisketch.com/en/))
- 포지셔닝: "국내 1위 AI 기반 3D 인테리어·가구배치 시뮬레이션" B2B2C SaaS. 고객사로 오늘의집(버킷플레이스), 퍼시스 그룹(일룸·데스커·시디즈), 듀오백, LG, 롯데홈쇼핑, 까사미아, 이노메싸 등 언급 ([채용 페이지](https://archisketch.career.greetinghr.com/ko/home), [테크42](https://www.tech42.co.kr/%EC%9D%B8%ED%84%B0%EB%B7%B0-%EC%9D%B4%EC%A3%BC%EC%84%B1-%EC%95%84%ED%82%A4%EB%93%9C%EB%A1%9C%EC%9A%B0-%EB%8C%80%ED%91%9C-%EC%98%A8%EB%9D%BC%EC%9D%B8-3d-%EC%9D%B8%ED%85%8C%EB%A6%AC%EC%96%B4/))
- 특허 분쟁: 어반베이스가 제기한 "2D 도면 기반 3D 자동 모델링" 특허침해 소송에서 2022년 민사 승소([ZDNet Korea](https://zdnet.co.kr/view/?no=20220818083048), [뉴시스](https://mobile.newsis.com/view.html?ar_id=NISX20220818_0001983236)), 2023년 특허무효(진보성 부정) 소송 최종 승소 ([대한경제](https://www.dnews.co.kr/uhtml/view.jsp?idxno=202303171502371530530), [와우테일](https://wowtale.net/2023/03/17/54460/)). 즉 "도면→3D 자동 변환" 자체는 특허 장벽이 없는 일반 기술로 판결됨
- 자체 보유 특허 목록: **미확인** (KIPRIS 직접 조회 못함)

---

## 1. 3D 에셋 파이프라인

### 확보 방식: "자체 모델링 팀 대행 + 기업 셀프 업로드" 이원 구조

**(1) 모델링 대행 (주력 경로)**
- 기업 고객이 대시보드에서 "신규 모델링 요청서"를 작성: **참조 이미지(필수), 제품 웹사이트 링크(필수), 제품의 너비·깊이·높이 수치를 직접 기입**. 매트리스·러그는 Top view 이미지 필수 ([공식 문서: 요청서 작성](https://docs.archisketch.com/enterprise/manage-furniture/new-modeling-request/fill-out-request.md))
- 문서 원문: "아키스케치는 전문 3D 모델러를 보유하고 있으며, 아키스케치 엔진에 최적화시켜 작업" — 즉 **사진+치수 기반의 자체 모델링 팀 제작**이 기본이며, 제조사 CAD 원본을 받아 변환한다는 언급은 문서상 없음 (제조사 CAD 직접 변환 여부: **미확인**)
- 이후 검수(examine-modeling) → 업로드 확인 → 카테고리 분류의 승인 파이프라인 존재 ([문서 인덱스](https://docs.archisketch.com/llms.txt))
- 대행 비용·소요 기간: 공개 문서에 없음 — **미확인**

**(2) 기업 셀프 업로드**
- 지원 포맷: **SKP(SketchUp 2023 이하), ZIP(OBJ, GLTF)**, 100MB 이하 ([공식 문서: SKP 업로드](https://docs.archisketch.com/enterprise/manage-furniture/upload-skp.md))
- 업로드 시 배치 속성(바닥 배치/스탠딩/천장 부착/벽 부착) 지정 필수. 미분류 상태에서는 에디터에서 사용 불가 → 카테고리 분류가 강제됨
- 하이폴리곤/대용량 파일은 업로드 실패 가능 → 아키스케치가 "신규 제작보다 저렴한 리터칭(엔진 최적화) 유료 서비스" 제공 (같은 문서)

**(3) API 등록**
- `POST /api/v1/modelings`로 3D 파일(.glb 예시) 업로드. 응답에 **`mmWidth, mmDepth, mmHeight` + 인치 환산값**이 치수 메타데이터로 포함됨 ([API 문서: 모델링](https://docs.archisketch.com/dev-kr/api-sdk/api-integration/3d-product-integration/modeling.md))

**(4) AI 생성**
- 공식 문서에 "AI 모델링 생성(create-ai-modeling)" 항목 존재 ([문서 인덱스](https://docs.archisketch.com/llms.txt)) — AI 기반 에셋 생성 경로가 있으나 상세(품질·용도·실판매 제품 연결 여부)는 **미확인**

### 치수 반영 구조: 메쉬 스케일 + 별도 mm 메타데이터 병행

- 등록은 3계층: **모델링(3D 파일) → 컴포넌트 → 상품(가격·구매 링크)** ([FAQ: 3D 상품 등록](https://docs.archisketch.com/faq/readme/product.md), [파라메트릭 라이브러리 구조](https://docs.archisketch.com/enterprise/parametric-library/structure.md))
- 형상(모델링 라이브러리)과 판매 정보(상품 라이브러리: "price, purchase links")가 분리된 DB 계층으로 관리됨
- 모델링 레코드에 mm 단위 W/D/H가 메타데이터 필드로 저장되므로, **메쉬 자체 스케일과 별개로 규격 수치를 DB에 보유**하는 구조. 다만 "메쉬가 항상 실측 1:1 스케일인지"에 대한 명시 규정 문서는 확인 못함 — **미확인** (모델링 요청 시 W/D/H를 정확히 기입하게 하는 점, 에디터가 mm 단위로 동작하는 점에서 실측 스케일 제작이 원칙인 것으로 추정)
- 파라메트릭 라이브러리: 커스텀·모듈 가구용으로 파라미터 라이브러리(전사 공통 치수 파라미터), 컴포넌트 에디터, 모듈 조합(modular), 스타일 룰 설정을 별도 제공 ([구조 문서](https://docs.archisketch.com/enterprise/parametric-library/structure.md), [커스텀 가구 문서](https://docs.archisketch.com/dev-kr/contents/custom-furniture.md))

---

## 2. 에디터 정확도

- **mm 단위 조작 확인**: 가구 이동 시 방향키 10mm, Shift+방향키 100mm 단위. 기준점 간 상대 거리를 수치로 정밀 입력 가능 ([공식 문서: 가구 배치](https://docs.archisketch.com/user/arranging-furniture/furniture-placement.md))
- **스냅**: 드래그 시 자동 스냅 정렬(노란 가이드라인), 회전 45° 스냅, 90° 단축키, 정렬(수직/수평/높이) 도구 (같은 문서)
- **충돌 감지: 문서상 확인 안 됨 — 미확인(사실상 없음으로 추정)**. 공식 문서의 "가구 위에 물건 올리기" 팁이 "높이 값을 수동으로 맞추거나 와이어프레임 모드를 사용"이라고 안내함 — 물리적 충돌/지지면 감지가 있다면 불필요한 안내이므로, 간섭 검증 기능은 없는 것으로 추정 (같은 문서)
- **임의 크기 조절 허용**: 배치된 가구를 바운딩 박스/속성 패널로 자유롭게 리사이즈 가능(비율 유지 옵션) — 즉 **에디터가 DB 실측 치수와의 일치를 강제하지 않음**. 사용자가 실제 제품과 다른 크기로 변형한 채 구매 결정을 내릴 수 있는 구조 (같은 문서)
- **공간 규격**: 공간별 바닥 기준 높이(양/음수, 욕실·현관 단차 표현), 방 단위 천장고 변경(벽 높이·천장 연동) 입력 가능. 바닥 높이 변경 시 가구 높이는 자동 보정되지 않음(수동) ([공식 문서: 천장/바닥 높이](https://docs.archisketch.com/user/make-project/ceiling-floor-height.md)). 벽 두께 개별 입력 방식: **미확인**
- **도면 확보**: 주소/지도 검색으로 아파트 도면 불러오기(자사 주장 "국내 아파트 도면의 96% 보유"), 도면 이미지 업로드 트레이싱, 직접 그리기, CAD 도면 업로드(Plus 플랜) ([공식 블로그](https://www.archisketch.com/en/blog/66d13cd57688f900193c2c56), [문서 인덱스](https://docs.archisketch.com/llms.txt))

---

## 3. 렌더링

- **자체 엔진 + 클라우드 렌더링**: "유니티나 언리얼 등 외산 엔진에 의존하지 않고 자체 엔진 개발", 클라우드에서 실사 렌더링을 기존 반나절 → **1~2분 내외**로 단축 ([경제전파사 인터뷰](https://www.economywave.co/interview-archisketch-3d-rendering-commerce-innovation/), [K글로벌타임스](http://www.kglobaltimes.com/news/articleView.html?idxno=26233)). "클라우드 기반 고성능 컴퓨팅으로 16K 렌더링 이미지 구현" ([테크42](https://www.tech42.co.kr/%EC%9D%B8%ED%84%B0%EB%B7%B0-%EC%9D%B4%EC%A3%BC%EC%84%B1-%EC%95%84%ED%82%A4%EB%93%9C%EB%A1%9C%EC%9A%B0-%EB%8C%80%ED%91%9C-%EC%98%A8%EB%9D%BC%EC%9D%B8-3d-%EC%9D%B8%ED%85%8C%EB%A6%AC%EC%96%B4/))
- **에디터는 웹 기반(WebGL 계열)**: 설치 없는 웹 에디터(planner.archisketch.com)로 동작하며, 3D Frontend Engineer 채용 공고가 "Three.js 또는 WebGL 기반 시각화 프로젝트 경험"을 요구 ([채용 공고](https://archisketch.career.greetinghr.com/ko/o/184732) — 페이지 직접 접근은 403, 검색 결과 스니펫 기준). 구조적으로 "실시간 편집=브라우저 WebGL, 고품질 실사=클라우드 서버 렌더"의 이원 구조로 추정
- **조명 시뮬레이션** ([공식 문서: 렌더 스튜디오](https://docs.archisketch.com/user/rendershot/render-studio.md)):
  - 태양광 강도(0.3~1.0 권장)·방향각 조절, **시간대 프리셋**(태양 강도·각도 연동)
  - 환경 설정: 색온도, 배경(HDRI성 배경 이미지) 밝기
  - 보조 조명: 천장 보조광(실내 전체 밝기), 간접조명, 스팟라이트
  - 개별 조명 기구의 룩스/와트 단위 물리 기반 광원 설정: **미확인**
- **출력**: 해상도 표준/2K/4K/8K, 비율 16:9·9:16·4:3·3:4·1:1, 1인칭/아이소메트릭/평면/파노라마 카메라. 720° 파노라마 투어, 미니룸, AR 뷰어, 임베드 가능한 3D 모델 뷰어 제공 ([문서 인덱스](https://docs.archisketch.com/llms.txt))
- **재질**: 가구 재질 수정(Effector), 텍스처 라이브러리, 마감재 직접 업로드(Plus/기업) ([문서 인덱스](https://docs.archisketch.com/llms.txt), [개인 플랜 FAQ](https://docs.archisketch.com/faq/readme/personal-plan.md))

---

## 4. 제품 DB와 커머스

- **규모**: "실제 판매 중인 약 10만여 개의 제품" (공식 사이트 소개문, [archisketch.com](https://www.archisketch.com/en/) 검색 결과 기준), "100여 개 가구 브랜드에 솔루션 제공" ([경제전파사](https://www.economywave.co/interview-archisketch-3d-rendering-commerce-innovation/)). 최신 정확 수치는 **미확인**
- **오늘의집 관계**: 오늘의집(버킷플레이스)은 **투자사이자 SaaS 고객**. 2020년 15억 원 투자 라운드에 버킷플레이스 참여 ([와우테일](https://wowtale.net/2020/06/01/13778/)). 오늘의집 "3D 인테리어"(ohou.se/interior3ds, ohouse.archisketch.com)는 아키스케치 SaaS를 SSO로 연동해 제공 — "별도 설치 프로그램 불필요, SSO 기반 통합" ([공식 블로그](https://www.archisketch.com/en/blog/63c64ea39311fd00120e558a))
- **실구매 연결**: 3D 씬 내 제품에 '제품 태그'가 붙고, 태그 클릭 → 구매하기 버튼 → 해당 제품 판매 페이지로 이동. 샘플·소품류 일부는 구매 링크 없음 ([공식 블로그: 5단계 가이드](https://www.archisketch.com/en/blog/66d13cd57688f900193c2c56), [공식 문서: 가구 검색](https://docs.archisketch.com/user/arranging-furniture/furniture-search.md)). 시숲(자사 B2C 컨설팅)은 "수수료 없이 각 업체 자사몰로 연동" ([테크42](https://www.tech42.co.kr/%EC%9D%B8%ED%84%B0%EB%B7%B0-%EC%9D%B4%EC%A3%BC%EC%84%B1-%EC%95%84%ED%82%A4%EB%93%9C%EB%A1%9C%EC%9A%B0-%EB%8C%80%ED%91%9C-%EC%98%A8%EB%9D%BC%EC%9D%B8-3d-%EC%9D%B8%ED%85%8C%EB%A6%AC%EC%96%B4/)) — 판매 수수료보다 SaaS 구독이 주 수익으로 추정
- **쇼핑몰 빌더 연동**: 카페24·샵바이·고도몰·워드프레스 공식 플러그인, Open API/SDK, MCP 연동 문서까지 존재 ([문서 인덱스](https://docs.archisketch.com/llms.txt), [워드프레스 플러그인](https://wordpress.org/plugins/archisketch-3d-interior-design-solution/))
- **롯데홈쇼핑 사례**: 웹 브라우저 가상공간에서 제품 클릭 → 상품 정보 → 구매 클릭 시 상품 페이지 이동 ([경제전파사](https://www.economywave.co/interview-archisketch-3d-rendering-commerce-innovation/))

---

## 5. BM (수익 구조)

**B2C 개인 플랜** ([개인 플랜 FAQ](https://docs.archisketch.com/faq/readme/personal-plan.md), [크레딧 가이드](https://docs.archisketch.com/faq/readme/credit-guide.md))
- Basic(무료): 기본 기능 + 기본 렌더링 제공량, 크레딧 1개
- Standard: 가구 재질 수정, 모델링 파일 업로드, 월 10크레딧
- Plus: + 마감재 직접 업로드, CAD 도면 업로드, 월 30크레딧
- 크레딧 종량제: **1크레딧 = 1,500원**. 2K 렌더샷 0.2크레딧, AI 스타일러 0.1크레딧, 6K 파노라마 0.6크레딧 등. 미사용 크레딧 1년 후 소멸
- 플랜 월정액 정가: 공식 pricing 페이지 접근 불가(403)로 **미확인** (크레딧 가이드 문서 요약상 Standard $29·Plus $79 상당 표기 — 원문 통화 표기 미검증)

**B2B**
- 팀 플랜: 최소 3인, 전용 도메인·로고·테마·렌더링 워터마크 브랜딩, 국내 카드 결제, 월/연 구독 ([팀 플랜 소개](https://docs.archisketch.com/user/pro-team-plan/team-plan-intro.md))
- 엔터프라이즈: 제품 라이브러리 관리, 파라메트릭(커스텀 가구) 시스템, 실시간 견적, CRM(견적 상담·고객 관리), AR 뷰어, 데이터 분석 등 별도 계약 ([문서 인덱스](https://docs.archisketch.com/llms.txt)). 가격 비공개 — **미확인**
- 부가 수익: 3D 모델링 제작 대행 및 기존 파일 리터칭(최적화) 유료 서비스 ([SKP 업로드 문서](https://docs.archisketch.com/enterprise/manage-furniture/upload-skp.md))
- B2B2C: 오늘의집·롯데홈쇼핑 등 대형 플랫폼에 화이트라벨성 공급 + 개인 대상 시숲(디자인 의뢰) ([경제전파사](https://www.economywave.co/interview-archisketch-3d-rendering-commerce-innovation/))
- 이주성 대표: "기술 라이선스 판매가 아니라 ERP·SCM·상품 DB와 직접 연동된 운영 플랫폼을 제공" ([뉴스락 인터뷰](http://www.newslock.co.kr/news/articleView.html?idxno=121272))

---

## 6. 한계 / 공백

- **정밀도의 기본 단위는 '방(공간)'**: 도면 96% DB, 벽·천장고, 방 단위 렌더가 핵심 루프. mm 단위 이동·정렬은 지원하지만 이는 "배치 편의" 기능이지 "제품 간 물리 검증"이 아님
- **치수 무결성 비강제**: 배치 후 임의 리사이즈가 허용되어, 시뮬레이션 속 크기와 실제 구매 제품 크기가 달라질 수 있음 ([가구 배치 문서](https://docs.archisketch.com/user/arranging-furniture/furniture-placement.md))
- **충돌/간섭 감지 부재(추정)**: 가구 위 소품 배치조차 높이 수동 입력·와이어프레임 팁으로 안내 — 지지면 스냅·간섭 경고 기능 확인 안 됨 (**미확인**)
- **데스크 수준 소품 지원**: 모니터암·클램프 거치대·케이블 정리·VESA 브래킷 등 데스크테리어 특화 카테고리는 공식 문서·라이브러리 설명 어디에서도 확인 안 됨 (**미확인** — 라이브러리가 가구·마감재·조명·소품 중심). 소품류는 구매 링크조차 없을 수 있다고 공식 문서가 명시
- **제품 간 호환성 검증 기능 없음(조사 범위 내)**: 클램프-상판 두께 매칭, VESA 100×100 지원 여부, 모니터암 허용 하중 대 모니터 무게 같은 "규격 간 관계" 검증은 문서·기사·API 어디에도 없음. 파라메트릭 스타일 룰은 자사 모듈 가구(붙박이장 등)의 조합 제약이지, **이종 브랜드 제품 간 호환성 검사가 아님** ([파라메트릭 문서](https://docs.archisketch.com/enterprise/parametric-library/structure.md))
- **치수 기반 검색 부재**: 라이브러리 필터는 브랜드·가격 정렬 수준. "상판 두께 20~40mm 클램프 가능한 조명" 같은 규격 조건 검색 없음 ([가구 검색 문서](https://docs.archisketch.com/user/arranging-furniture/furniture-search.md))

---

## 7. 데스크테리어 서비스 관점 시사점

### (a) 차용할 구조

1. **3계층 에셋 모델 (모델링 → 컴포넌트 → 상품)**: 형상(메쉬 파일), 배치 단위(컴포넌트: 배치 속성·재질 변형), 판매 정보(가격·구매 링크)를 분리. 동일 형상의 색상 변형·리셀러 다중 판매 링크를 메쉬 복제 없이 처리 가능
2. **메쉬 + mm 메타데이터 병행**: 메쉬는 실측 스케일로 제작하되, `mmWidth/mmDepth/mmHeight`를 별도 DB 필드로 이중 보관(API 응답 스키마에서 확인된 패턴). 데스크 스코프에서는 여기에 **규격 필드를 확장**(VESA 규격, 클램프 개구 범위, 허용 하중, 상판 두께, 케이블 홀 지름 등)하면 아키스케치가 안 하는 호환성 검증의 데이터 기반이 됨
3. **배치 속성 분류 강제**: 업로드 시 바닥/스탠딩/벽 부착/천장 부착 지정 + 미분류 시 에디터 사용 불가. 데스크 버전: "상판 위 스탠딩 / 클램프 / 그로밋 / VESA 마운트 / 벽 부착" 등 **장착 방식 태그를 필수화**
4. **모델링 요청 → 검수 → 승인 파이프라인**: 사진+실측 치수 기반 대행 제작과 셀프 업로드(glTF/OBJ) 이원화, 검수 게이트로 품질·스케일 통제. 초기엔 소수 인기 제품을 수작업으로 확보하는 아키스케치식 콜드스타트가 현실적
5. **파라메트릭 파라미터 라이브러리**: 전사 공통 치수 파라미터를 컴포넌트가 참조하는 구조 — 데스크 상판(폭×깊이×두께)을 파라메트릭으로 두고 소품 배치를 종속시키는 설계에 직접 응용 가능
6. **웹 에디터(WebGL) + 무거운 연산은 클라우드** 이원 구조, 크레딧 종량 과금(1크레딧=1,500원, 렌더 0.2크레딧 등)은 렌더링 비용 회수 모델로 참고 가치
7. **제품 태그 → 판매 페이지 이동**형 커머스 연결(수수료 무관 자사몰 링크)은 제휴 부담 없이 시작 가능한 최소 커머스 루프

### (b) 아키스케치가 못 하는 데스크 스코프 호환성 검증의 공백 (기회 목록)

1. **클램프-상판 매칭**: 모니터암/조명/거치대 클램프의 개구 범위(예: 10~50mm) vs 데스크 상판 두께·프레임 간섭·보강대 위치 검증
2. **VESA 매칭**: 모니터의 VESA 규격(75×75/100×100/200×100 등) 및 VESA 미지원(젠더 필요) 여부 vs 암/스탠드의 지원 규격
3. **하중 검증**: 모니터암 허용 하중 범위(예: 2~9kg) vs 실제 모니터 무게(스탠드 제외 무게 데이터 필요)
4. **가동 범위/간섭**: 암 링크 길이 대비 벽-책상 이격 거리, 모니터 상단 높이 vs 선반 하단, 듀얼 모니터 폭 합 vs 상판 폭
5. **그로밋/케이블 홀**: 홀 지름 vs 그로밋 마운트 규격, 케이블 트레이 장착 폭 vs 프레임 간격
6. **규격 조건 검색**: "두께 25mm 상판에 물릴 수 있는 것", "VESA 100 지원 + 8kg 이상" 같은 호환성 필터 — 아키스케치 라이브러리엔 브랜드·가격 필터뿐
7. **치수 무결성 강제**: 아키스케치는 임의 리사이즈를 허용하지만, 데스크테리어는 실측 고정 스케일 + 지지면 스냅 + 간섭(충돌) 경고를 기본값으로 해야 "배치 = 구매 가능"이라는 신뢰가 성립
8. **에르고노믹스 검증**: 책상 높이-의자 좌면-모니터 눈높이 관계 체크 — 방 단위 도구에는 없는 데스크 고유 가치

> 요약: 아키스케치의 해자는 "도면 DB + 자체 클라우드 렌더러 + 10만 제품 에셋"이라는 방 단위 스케일이며, 제품 '간' 규격 관계(장착·하중·호환)는 데이터 스키마에도 기능에도 존재하지 않는다(조사 범위 내). 데스크테리어 서비스는 에셋 3계층 구조와 mm 메타데이터 패턴을 차용하되, 호환성 규격 필드와 검증 엔진으로 차별화하는 것이 타당하다.

---

## 주요 출처

- 공식: [archisketch.com](https://www.archisketch.com/en/) · [공식 문서](https://docs.archisketch.com/) · [문서 전체 인덱스(llms.txt)](https://docs.archisketch.com/llms.txt) · [공식 블로그(오늘의집)](https://www.archisketch.com/en/blog/63c64ea39311fd00120e558a) · [채용](https://archisketch.career.greetinghr.com/ko/home)
- 인터뷰: [경제전파사](https://www.economywave.co/interview-archisketch-3d-rendering-commerce-innovation/) · [테크42](https://www.tech42.co.kr/%EC%9D%B8%ED%84%B0%EB%B7%B0-%EC%9D%B4%EC%A3%BC%EC%84%B1-%EC%95%84%ED%82%A4%EB%93%9C%EB%A1%9C%EC%9A%B0-%EB%8C%80%ED%91%9C-%EC%98%A8%EB%9D%BC%EC%9D%B8-3d-%EC%9D%B8%ED%85%8C%EB%A6%AC%EC%96%B4/) · [뉴스락](http://www.newslock.co.kr/news/articleView.html?idxno=121272) · [글로벌이코노믹](https://www.g-enews.com/article/ICT/2025/01/2025010110383157353b60030fa2_1)
- 소송/투자: [ZDNet](https://zdnet.co.kr/view/?no=20220818083048) · [대한경제](https://www.dnews.co.kr/uhtml/view.jsp?idxno=202303171502371530530) · [와우테일(투자)](https://wowtale.net/2020/06/01/13778/) · [THE VC](https://thevc.kr/archisketch)
