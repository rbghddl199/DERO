# 데스크테리어 미리 보기 서비스 — 유사 서비스 시장 조사

- 조사일: 2026-07-14
- 조사 방법: 웹 검색 + 1차 출처(공식 사이트·공식 블로그·공식 도움말) 직접 확인. 1차 출처 접근이 차단(403)되거나 확인 불가한 항목은 "미확인"으로 표기.
- 목적: "책상 단위 3D 배치 + 규격·호환성 검증 + 예산 기반 견적"을 통합한 데스크테리어 미리 보기 서비스의 경쟁 지형 파악.

---

## 1. 3D/2D 인테리어 배치 시뮬레이터

### 1-1. 오늘의집 3D 인테리어 (버킷플레이스)

- **기능**: 집 도면을 불러오거나 입력해 실제 비율의 3D 가구·제품을 배치. 고품질 렌더링(렌더샷), 파노라마 쇼룸, 타임랩스, 커뮤니티 공유, 배치한 제품 스크랩·구매 연결. ([오늘의집 3D 인테리어 공식 페이지](https://ohou.se/interior3ds) — 페이지 직접 fetch는 403으로 차단, 검색 결과 요약 기준)
- **기술 기반**: 2020년 아키스케치의 SaaS를 구독 방식으로 전면 도입, SSO로 오늘의집 계정과 연동. ([아키스케치 공식 블로그](https://www.archisketch.com/en/blog/63c64ea39311fd00120e558a))
- **규모**: 검색 결과 기준 2025년 5월 130만 명 이상 가입 서비스로 소개됨 (1차 출처 원문 직접 확인은 미확인). AR 기능 경험 고객이 미경험 대비 약 79% 높은 구매 전환율(2024-07 오늘의집 데이터, 검색 결과 요약 기준).
- **타겟**: 이사·집 꾸미기를 앞둔 일반 소비자 (B2C).
- **BM**: 시뮬레이터 자체는 무료, 오늘의집 본체의 커머스 판매 수수료 + 광고 + 시공 중개가 수익원. 2024년 매출 2,879억 원, 창사 첫 연간 흑자. ([와우테일](https://wowtale.net/2025/03/31/239186/), [머니투데이](https://www.mt.co.kr/future/2025/04/01/2025040110502558926))
- **제품 실구매 연결**: 있음 — 배치 제품 스크랩·구매, 콘텐츠 내 제품 태그. ([아키스케치 공식 블로그](https://www.archisketch.com/en/blog/63c64ea39311fd00120e558a))
- **한계(데스크테리어 관점)**: 공간 단위(집·방)가 기본 스케일. 책상 위 소품·주변기기(모니터암, 거치대, 데스크매트) 수준의 정밀 배치와 규격 검증(클램프-상판 두께, VESA)은 제공하지 않음(공식 기능 설명에 해당 기능 언급 없음 — 미확인이 아니라 부재로 판단).

### 1-2. Planner 5D

- **기능**: 2D 도면 + 3D 모델링, 드래그앤드롭 배치, AI 디자인 생성기, 평면도→3D 변환, 4K 렌더링·360° 투어(상위 플랜). ([Planner 5D 공식 요금 페이지](https://planner5d.com/pricing))
- **타겟**: 일반 소비자(무료·Premium) + 전문 디자이너(Professional) + 기업(Enterprise).
- **BM**: 프리미엄 구독. 무료(카탈로그 50%), Premium 월 $4.99/연 $59.99(AI 생성·1만+ 가구·**예산 위젯**), Professional 연 $399.99(무제한 4K 렌더·CAD 내보내기), Enterprise(화이트라벨·e-commerce 통합). ([공식 요금 페이지](https://planner5d.com/pricing))
- **제품 실구매 연결**: 기본적으로 가상 카탈로그 중심. e-commerce 통합은 Enterprise 커스텀 영역. 일반 사용자용 실구매 연결은 미확인.
- **한계**: 방·집 단위 설계 도구. 실판매 제품 DB가 아니어서 "이 조합을 그대로 산다"로 이어지지 않음. 데스크 규격·호환성 검증 없음.

### 1-3. Roomstyler (Floorplanner 운영)

- **기능**: 브라우저 기반 3D 룸 플래너. 벽 그리기, 실브랜드 가구 배치, 포토리얼 렌더, 커뮤니티 공유. 12만+ 아이템. ([Roomstyler 3D Planner 공식](https://roomstyler.com/3dplanner))
- **타겟**: 디자인 경험 없는 일반 사용자.
- **BM**: 부분 무료(평면도 업로드 연 2회 무료 등) + 프리미엄. 제품 상세에 "Buy" 버튼과 **Total cost(총액) 표시**가 있어 배치→구매 동선이 존재. ([공식 3D Planner 페이지](https://roomstyler.com/3dplanner))
- **한계**: 방 단위. 해외 브랜드 카탈로그 중심으로 국내 제품·가격 정합성 없음. 호환성 검증 없음.

### 1-4. IKEA Kreativ

- **기능**: 자기 방을 사진/LiDAR로 스캔 → 기존 가구를 "지우고" IKEA 제품을 실측 스케일로 배치·교체. 50+ 가상 쇼룸 탐색. ([IKEA 공식 FAQ "What is IKEA Kreativ?"](https://www.ikea.com/us/en/customer-service/knowledge/articles/b548fdg1-8c6f-448e-97c5-6f78e114c504.html), [IKEA Kreativ 공식 페이지](https://www.ikea.com/us/en/home-design/))
- **타겟**: IKEA 구매를 고려하는 일반 소비자.
- **BM**: 완전 무료 도구 — IKEA 커머스 판매를 위한 전환 퍼널. 배치한 제품을 그대로 장바구니로 연결.
- **제품 실구매 연결**: 있음 (IKEA 제품 한정).
- **한계**: IKEA 단일 브랜드 폐쇄 생태계. 직물·천장 설치 제품·주방 전체 설계 미지원(공식 FAQ 명시). 데스크 액세서리·전자기기 조합이나 호환성 개념 없음.

### 1-5. Coohom (쿠홈)

- **기능**: 클라우드 기반 2D/3D 설계 + 포토리얼 렌더링(최대 16K), 대형 3D 모델 라이브러리, AI 레이아웃 제안. ([Coohom 공식 요금 페이지](https://www.coohom.com/pricing), [Capterra](https://www.capterra.com/p/192882/Coohom/))
- **타겟**: 전문 인테리어 디자이너·가구 기업(B2B 성격 강함). Basic 무료 / Pro 월 $29 / Elite 월 $69 / Enterprise 맞춤. ([공식 요금 페이지](https://www.coohom.com/pricing))
- **BM**: 프로 구독 + 기업 솔루션(가구 브랜드의 3D 쇼룸·커머스 지원).
- **제품 실구매 연결**: 최종 소비자 직접 구매 연결은 미확인 (기업 고객의 커머스 지원 도구 성격).
- **한계**: 디자이너·기업용 도구라 일반 소비자의 "내 책상 꾸미기" 용도와 거리가 있음.

### 1-6. 아키스케치 (Archisketch)

- **기능**: AI 3D 인테리어 시뮬레이션, 전국 12만+ 아파트 도면 DB, 실판매 제품 약 10만 개 배치, 16K 렌더링·파노라마 쇼룸, AR. ([아키스케치 공식](https://www.archisketch.com/en/))
- **타겟**: 3단 구조 — 개인(무료), 프로 디자이너(프로 요금제), 기업(B2B: 오늘의집·LG오브제컬렉션·LH 등 프로젝트). ([아키스케치 공식](https://www.archisketch.com/en/), [beSUCCESS](https://besuccess.com/?p=175194))
- **BM**: SaaS 구독(프로·비즈니스) + B2B 기술 공급(오늘의집 3D가 대표 사례). 구체 가격은 비공개.
- **제품 실구매 연결**: 있음 — 실판매 제품 DB 기반, 커머스 연계 플랫폼과 연동. ([아키스케치 공식](https://www.archisketch.com/en/))
- **한계**: 아파트 도면·방 단위 중심. 데스크 스케일의 정밀 배치·규격 검증은 제품 범위 밖.

### 1-7. 데스크 특화 3D 플래너 (핵심 발견 — 가장 가까운 경쟁군)

| 서비스 | 기능 | BM | 구매 연결 | 호환성/예산 |
|---|---|---|---|---|
| [Juddesk](https://www.juddesk.com/) | 3D 아이소메트릭 뷰에서 **100+ 실제 제품을 실측 스케일**로 책상 배치, 바닥·벽 스타일링, 공유 | 완전 무료(가입 불필요, 제한 없음 — 공식 명시) | 있음 — "open your parts list to buy the exact gear you placed" (부품 목록→구매) | 실측 스케일이라 **물리적 fit(공간 간섭)은 확인 가능**. 클램프-두께·VESA 같은 규격 검증, 예산 견적 기능은 페이지상 없음 |
| [DeskSpacing](https://deskspacing.com/) | 3D 앱으로 데스크 셋업 시뮬레이션, 사전 정의된 크기의 오브젝트 배치 | 무료 체험 명시, 상세 미확인 | 페이지상 언급 없음 (미확인) | 언급 없음 |
| [desksetup.app](https://www.desksetup.app/) | 모니터(커브드/플랫, 화면비) 비교 중심의 3D 시각화 | 미확인 (페이지 정보 부족) | 미확인 | 미확인 |
| [DeskSetupCreator](https://www.desksetupcreator.com/) | 게이밍 셋업 3D 빌더 (검색 결과로만 확인) | 미확인 | 미확인 | 미확인 |

- **한계(공통)**: 해외 서비스·해외 제품 카탈로그(국내 판매 제품·가격 미반영). 제품 수가 적음(Juddesk 100+). 클램프-상판 두께, VESA 규격, 총예산 견적 같은 **구조화된 검증·견적 기능은 어느 곳도 명시하지 않음**.

---

## 2. 데스크셋업 특화 서비스/커뮤니티

### 해외

- **Reddit r/battlestations**: 약 5.2M 멤버(2차 출처 [GummySearch 통계](https://gummysearch.com/r/battlestations/) 기준 — Reddit 직접 확인은 미확인). 완성 셋업 사진 공유 + 장비 추천·리뷰가 주 활동. 니즈: 과시·영감·장비 정보. 배치 시뮬레이션·호환성 검증 기능은 당연히 없음.
- **Workspaces.xyz**: 주간 뉴스레터(매주 토요일), 구독자 21,000+, 크리에이터 데스크 투어(사진·장비 목록·인터뷰). YC 스타트업 Loops에 인수됨. ([Workspaces 공식 About](https://www.workspaces.xyz/about), [Starter Story](https://www.starterstory.com/stories/workspaces)) BM: 뉴스레터 광고([Advertise 페이지](https://workspaces.xyz/advertise)).
- **Maker Stations**: 190+ 실제 셋업 투어, 셋업별 장비 인벤토리·비용·스타일 필터(게이밍/미니멀/일본식 등), 주간 뉴스레터. ([makerstations.io](https://www.makerstations.io/)) BM: 명시적 수익화 불분명(제휴 링크 추정 — 미확인).
- **Minimal Desk Setups**: 셋업 큐레이션 + 가이드 + **자체 상품 판매**(데스크패드·케이블 정리 키트·타이머) + 크리에이터 제휴 프로그램. ([minimaldesksetups.com](https://www.minimaldesksetups.com/)) — 커뮤니티→자체 커머스로 수직 확장한 사례.

### 국내

- **디시인사이드 데스크테리어 마이너 갤러리**: 존재하나 활동 저조 — 2026년 7월 확인 시 최근 글이 주 1~2건 수준, 글 유형은 장비 문의·셋업 평가 요청·제품 추천·완성 셋업 공유. ([갤러리](https://gall.dcinside.com/mgallery/board/lists/?id=deskterior)) 별도의 [데스크셋업 마이너 갤러리](https://m.dcinside.com/board/desksetup), [데스크테리어 미니 갤러리](https://m.dcinside.com/mini/deskterior)도 존재 (활동량 미확인).
- **네이버 카페 데스크테리어 커뮤니티**: 검색으로 특정 대표 카페·규모를 1차 출처로 확인하지 못함 — **미확인**.
- **데스커(DESKER, 퍼시스그룹)**: 워크 앤 라이프스타일 가구 브랜드. 오프라인 커뮤니티 공간 "데스커 라운지 홍대" 운영, 전시·큐레이션·프로그램 제공, 해운대·대구 확장 계획. ([데스커 공식](https://www.desker.co.kr/), [공식 컬쳐 페이지](https://www.desker.co.kr/culture/detail/53), [뉴스와이어](https://www.newswire.co.kr/newsRead.php?no=982982)) BM: 자사 가구 판매의 브랜딩 채널. 온라인 배치 시뮬레이터는 미확인.

**채우는 니즈와 공백**: 이들 커뮤니티/미디어는 "영감 + 장비 정보 공유" 니즈를 채움. 그러나 (1) 사진 속 제품을 내 책상 치수에 맞는지 확인할 방법, (2) 구매 전 배치 미리 보기, (3) 예산 내 조합 견적 — 셋 다 사용자가 댓글 질문·수작업 검색으로 해결하고 있음. 국내는 전용 커뮤니티 자체가 소규모·분산 상태.

---

## 3. 제품 규격·호환성 확인 도구

- **Basic Free Tools — Monitor Mount Checker**: 모니터-마운트 간 **VESA 패턴·무게 용량·화면 크기** 호환성을 브라우저에서 검증하는 무료 도구. 단, **책상 두께(클램프) 검증은 범위 밖** — "마운트는 데스크톱이나 벽에 안전하게 설치되어야 한다"고 사용자 확인에 맡김. ([basicfreetools.com/monitor-mount-checker](https://basicfreetools.com/monitor-mount-checker/))
- **Ergotron Mount Finder**: 자사 공식 도구 — 모니터 사양을 입력하면 호환되는 Ergotron 암/스탠드를 찾아줌. ([ergotron.com/en-us/tools/mount-finder](https://www.ergotron.com/en-us/tools/mount-finder) — 페이지 직접 fetch 403, 검색 결과 기준. 책상 두께·클램프 검증 포함 여부 미확인) 자사 제품 한정 도구라는 점이 본질적 한계.
- **국내 현황**: 전용 도구를 찾지 못함. 클램프-상판 두께(통상 10~100mm), 하부 프레임 간섭, 유리 상판 불가, VESA 75/100 확인 같은 지식이 **블로그 가이드·커뮤니티 질문으로만 유통**됨. ([풀린IT 가이드](https://it.pulin.co.kr/%EB%AA%A8%EB%8B%88%ED%84%B0%EC%95%94-%EC%84%A4%EC%B9%98-%EC%A1%B0%EA%B1%B4-%ED%99%95%EC%9D%B8%ED%95%98%EA%B8%B0-%EC%B1%85%EC%83%81-%EB%91%90%EA%BB%98%EC%99%80-%EB%B2%A0%EC%82%AC%ED%99%80-%EA%B7%9C/), [퀘이사존 사례](https://quasarzone.com/bbs/qf_etc/views/72462), [클리앙 사례](https://www.clien.net/service/board/kin/18920182))
- **PCPartPicker 모델의 데스크셋업 버전**: PCPartPicker는 PC 부품 간 소켓·규격·전력 호환성을 자동 검증하고 가격 비교·견적을 제공하는 확립된 모델. ([pcpartpicker.com](https://pcpartpicker.com/)) 이 모델을 **책상·모니터암·모니터·주변기기 조합에 적용한 서비스는 이번 조사에서 발견되지 않음** (단일 항목 검증 도구만 존재).

**공백**: "책상 상판 두께 ↔ 클램프 범위 ↔ 모니터 무게 ↔ 암 하중 ↔ VESA 규격"을 하나의 장바구니 단위로 교차 검증해 주는 도구는 국내외 모두 부재 (조사 범위 내).

---

## 4. 무드/예산 기반 가구·소품 추천

- **오늘의집**: 콘텐츠(집들이 사진·제품 태그) → 커머스로 잇는 추천이 핵심 BM. 커머스 수수료 + 광고(고마진) + 시공 중개가 수익원. ([바이라인네트워크](https://byline.network/2024/02/02-102/), [와우테일](https://wowtale.net/2025/03/31/239186/)) 무드(스타일) 탐색은 강하지만 "예산 X원으로 책상 완성" 같은 견적 단위 추천은 미확인.
- **Pinterest 쇼핑**: Product Pins(가격·재고 표시), 라이프스타일 이미지에 제품 태그, 비즈니스 프로필 Shop 탭. 입점·태그 무료, 광고 캠페인으로 수익화(판매 수수료 없음). ([Pinterest Business 공식 도움말](https://help.pinterest.com/en/business/guide/shopping-on-pinterest), [Pinterest 뉴스룸](https://newsroom.pinterest.com/news/pinterest-doubles-down-on-shopping-introducing-api-for-shopping-and-product-tagging-for-pins/)) 무드보드→구매 동선의 대표 사례이나, 배치·치수·호환성 개념은 없음.
- **예산 기능이 있는 시뮬레이터**: Planner 5D Premium의 **예산 위젯**([공식 요금 페이지](https://planner5d.com/pricing)), Roomstyler의 배치 제품 **Total cost 표시**([공식](https://roomstyler.com/3dplanner)) — 다만 둘 다 "배치한 것의 합계" 수준이며, "예산 상한을 입력하면 조합을 추천"하는 역방향 견적은 미확인.

**공백**: 무드 기반 추천(오늘의집·Pinterest)과 배치 도구(시뮬레이터)가 분리되어 있고, "무드 + 예산 상한 → 호환되는 데스크셋업 조합 자동 견적"을 제공하는 서비스는 발견되지 않음.

---

## 시장 공백 종합

**(a) 책상 단위 3D 배치 / (b) 규격·호환성 검증 / (c) 예산 기반 견적 — 세 가지를 통합한 서비스는 이번 조사 범위에서 존재하지 않음.**

| 축 | 최고 수준 기존 서비스 | 커버 범위 |
|---|---|---|
| (a) 책상 단위 3D 배치 | [Juddesk](https://www.juddesk.com/) | 실측 스케일 3D 배치 + 부품 목록 구매 연결 (해외, 제품 100+개) |
| (b) 규격·호환성 검증 | [Monitor Mount Checker](https://basicfreetools.com/monitor-mount-checker/), [Ergotron Mount Finder](https://www.ergotron.com/en-us/tools/mount-finder) | VESA·무게·화면 크기 단품 검증만. **클램프-상판 두께 교차 검증 부재** |
| (c) 예산 기반 견적 | [Planner 5D 예산 위젯](https://planner5d.com/pricing), [Roomstyler Total cost](https://roomstyler.com/3dplanner) | 배치 합계 표시 수준. 예산 역산 추천 부재 |

- **가장 가까운 단일 경쟁자: Juddesk** — (a)를 실측 스케일로 구현했고 물리적 fit 확인 + 구매 목록 연결까지 있어 (b)의 일부(공간 간섭)와 (c)의 일부(부품 목록)를 스치듯 커버. 그러나 규격 데이터 기반 자동 검증(클램프·VESA·하중)과 예산 견적은 없으며, 국내 제품·가격 미지원.
- **국내 기준 가장 가까운 경쟁자: 오늘의집 3D 인테리어(아키스케치 기반)** — 실판매 제품 DB + 커머스 연결 + 대규모 사용자라는 자산은 압도적이나, 스케일이 방 단위이고 데스크 규격·호환성·견적 개념이 없음. 반대로 오늘의집이 마음먹으면 가장 빨리 진입할 수 있는 플레이어이기도 함.
- **결론**: PCPartPicker가 PC 부품에서 증명한 "호환성 검증 + 가격 견적 + 커뮤니티 빌드 공유" 모델이 데스크셋업 영역에는 비어 있다. 특히 국내는 (a)(b)(c) 어느 축의 전용 서비스도 없고, 관련 니즈가 커뮤니티 질문·블로그 가이드로만 해소되고 있어, 국내 판매 제품 DB(치수·클램프 범위·VESA·무게·가격)를 구조화하는 것 자체가 진입 장벽이자 차별화 포인트가 된다.

---

### 미확인 항목 정리

- 오늘의집 3D 인테리어 공식 페이지 원문(403 차단), 130만 가입 수치의 1차 출처 원문
- Ergotron Mount Finder의 책상 두께·클램프 검증 포함 여부(403 차단)
- 국내 대표 데스크테리어 네이버 카페의 존재·규모
- DeskSpacing·desksetup.app·DeskSetupCreator의 BM·구매 연결 상세
- Coohom·Planner 5D의 일반 소비자용 실구매 연결 여부
- r/battlestations 멤버 수의 Reddit 공식 수치 (2차 출처 5.2M만 확인)
