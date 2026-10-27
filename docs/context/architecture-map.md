# 시스템 아키텍처 설계 맵

> wayfinder 맵. 부모 에픽 DERO-125.
> 결정 티켓은 Jira에, **순서·블로킹·타입·안개는 이 파일이 정본이다.** (`wayfinder:*` 라벨 금지 — 2026-07-24 결정)
> 세션 규칙: **한 세션에 결정 티켓 하나.** 조사 티켓만 예외로 병렬 실행한다.

## 목적지

백엔드·인프라·API 계약의 설계 결정을 전부 확정해, 구현 착수 전에 결정할 것이 남지 않은 상태.
**코드 0줄** — 산출물은 결정이지 구현이 아니다. 맵이 걷히면 `/to-spec`으로 인계한다.

## 제약·메모

- **백엔드 2명 / 4주.** 설계는 보수 쪽으로 눌러라 — 계층 얕게, 외부 의존 최소, 단일 EC2 유지.
- 팀 숙련도: Spring MVC 계층형만 경험, 포트/어댑터는 처음. **헥사고날 전면 채택은 하지 않기로 확정됐다**(128) — 계층형 유지 + 깊은 엔티티 + 외부 경계 3곳만 포트. 정본 `docs/adr/0001-backend-layering.md`.
- 범위 **포함**: AI 상상도(REQ-IMG), 소셜 로그인, 사용자 GLB 업로드(REQ-COM-09~11).
  - ⚠ 4주 2명에 이 셋을 다 얹으면 과부하다. 구현 단계에서 잘릴 1순위 후보 — 설계는 셋 다 빠질 수 있게 경계를 두어라.
- 인프라: 교육기관가 **인스턴스 1대만** 제공. S3는 개인 AWS 계정에 만들 예정.
- ✅ **확인됨(137, 2026-07-27)** — 그 1대는 **EC2가 아니라 AWS Lightsail**이다. `t2.xlarge`(4 vCPU/16GB) · 320GB SSD · `ap-northeast-2a` · **월 전송량 6TB 포함**. 파급 셋: ①아웃바운드가 100GB가 아니라 6TB라 프록시 경로의 대역폭 비용 부담이 사라졌다 ②**인스턴스 역할로 AWS 리소스에 접근할 수 없다** — `AmazonLightsailInstanceRole`에 identity-based 정책이 없고(AccessDenied 실측) 그걸 고칠 IAM 권한도 우리에게 없다. 크로스 계정 S3를 인스턴스 역할로 푸는 길(ADR 후보 §5 방식 A·B)이 막혔다 ③Lightsail 자체 Object Storage+CDN이라는 선택지 G가 새로 생겼다. 상세 `docs/research/asset-delivery-infra.md` §8.
- ✅ **확인됨(127)** — S3를 EC2 IP로 잠그면 **브라우저는 GLB를 직접 못 받는다**(`aws:SourceIp`는 요청자 IP를 본다). 원래 계획대로 가면 에셋 전량이 WAS를 통과한다. 덧붙여 IP 잠금은 **고정 IP가 전제**다 — 재시작으로 IP가 바뀌면 정책이 그날 깨진다. Lightsail이므로 EIP가 아니라 **Lightsail static IP**를 붙여야 하고(붙어 있는 동안 무료), **현재 붙어 있는지는 미확인**이다(137 잔여 항목).
- `docs/context/erd.md`는 **동결**이다. 스키마는 설계의 입력이지 산출물이 아니다. 바꿔야 하면 박동규 승인.
- 결정 착지점: 기술 결정은 `docs/adr/`, 기획급이면 `docs/CONTEXT.md` D22+.
- 세션이 참조할 스킬: `/grilling`, `/domain-modeling`, `/research`.

## 프론티어 — 지금 잡을 수 있는 것

| 티켓 | 타입 | 질문 |
|---|---|---|
| [DERO-137 인프라 계정·스펙 확인](DERO-137) | 작업 | 교육기관 EC2 타입·디스크·리전·EIP·IAM 권한, 개인 AWS 계정 생성 시점. 확인 항목 전체는 `docs/research/asset-delivery-infra.md` §8. **박성은이 잡음(진행 중)** |
| ~~[DERO-138 AI 응답 지연 실측](DERO-138)~~ | 작업 | **폐기 (2026-07-31, D27·ADR-0015)** — 상상도 provider가 외부 API가 아니라 **우리 로컬 노트북의 python 프로세스**로 정해져 외부 후보 p50/p95를 잴 이유가 없어졌다. **그 로컬 모델 기획은 2026-08-06 파기됐고 provider는 GMS로 확정됐다**(D29·ADR-0025) — 그래도 이 티켓은 폐기인 채다(비교할 후보가 없다). 대신 **GMS 생성 시간 실측**이 여전히 필요하다: 스위퍼 타임아웃 10분과 비교할 값은 `read-timeout × IMAGES_PER_UPLOAD`이고, 1장 개정으로 최악이 15분에서 5분으로 줄었다 |

결정 티켓은 남지 않았다 — 135(API 응답 규약)·177(배치 저장 페이로드)·192(환경 분리·시크릿)가 닫히며 프론티어의 그릴링이 비었다. 137은 밖에서 사실을 물어오는 일이라 병행해도 되고, 137이 풀리면 131·132가 열린다.

**백엔드 init은 192가 닫히며 열렸다** — 이 맵의 목적지(코드 0줄) 너머라 맵 티켓이 아니라 별도 작업으로 나간다.

## 블로킹된 티켓

| 티켓 | 타입 | 막는 것 |
|---|---|---|
| [DERO-131 에셋 전달 경로 결정](DERO-131) | 그릴링 | ← 137 |
| [DERO-132 DB 배치 위치 결정](DERO-132) | 그릴링 | ← 137 |
| ~~[DERO-136 GLB 업로드 경로 결정](DERO-136)~~ | 그릴링 | **선결정으로 닫힘 (2026-07-31, ADR-0016)** — 131이 미결이어도 API 계약(presign 2단계)은 경로와 무관해 지금 고정했고, 발급을 `PresignPort` 뒤에 숨겨 로컬 구현으로 시작한다. 131엔 "포트 구현 교체"만 남는다 |
| ~~[DERO-139 AI provider 결정](DERO-139)~~ | 그릴링 | **폐기 (2026-07-31, D27·ADR-0015)** — provider가 **자체 로컬 모델**로 정해져 그릴링할 갈림길이 없어졌다. **2026-08-06 그 기획이 파기되고 provider는 GMS(외부 API)로 확정됐지만**(D29·ADR-0025) 갈림길이 없다는 결론은 그대로다 — 6주째 유일한 구현을 정본으로 인정한 것이라 비교할 후보가 여전히 없다. 130 조사가 짚었던 셋 중 "동기 대 비동기"는 **비동기**로, "비용 하드캡"은 **일일 한도(장 단위)**로 닫혔고, "품질 대 기하 보존"은 스크린샷을 입력으로 쓰는 image-to-image로 보존 쪽 수단이 생겼다 |

## 결정 기록

<!-- 티켓을 닫을 때마다 한 줄. 상세는 티켓 코멘트와 조사 문서에 있고, 여기엔 요지와 링크만 둔다. -->

- [DERO-127 에셋 전달 인프라 조사](DERO-127) — IP 잠금 S3는 브라우저 직배신 불가(확정), CloudFront+OAC면 가능하되 `CORS-S3Origin` 필수. 경로 선택지 6개(A~F)와 대가는 `docs/research/asset-delivery-infra.md`.
- [DERO-130 AI 상상도 연동 조사](DERO-130) — 갈림길 셋: 품질 대 기하 보존, 동기 대 비동기, 비용 하드캡 유무. 한국 실측 지연은 공개 자료가 없다. `docs/research/ai-image-provider.md`.
- [DERO-128 백엔드 계층 구조 결정](DERO-128) — 계층형 유지 + 깊은 엔티티 + 외부 경계 3곳(추천 엔진·AI provider·스토리지)만 포트. 헥사고날·클린 전면 채택 안 함. 정본 `docs/adr/0001-backend-layering.md`.
- [DERO-129 인증 전략 결정](DERO-129) — 백엔드 Spring이 소셜 OAuth 교환(카카오·구글), JWT 액세스 30분(메모리·Bearer) + 회전 리프레시 14일 슬라이딩(httpOnly 쿠키·Redis). 신원 키는 `(provider, provider_id)`, 이메일은 표시값. 재사용 탐지 시 그 사용자 전 세션 무효화. 정본 `docs/adr/0005-auth-social-oauth-jwt-rotation.md`.
- [DERO-133 영속성 도구 결정](DERO-133) — JPA 단독. **QueryDSL은 넣지 않고 도입 트리거만 정의**(같은 조회의 `@Query`가 3갈래 이상, 단 잔여 1주 미만이면 `Specification`) — Hibernate 7.4 GA에서 검증된 QueryDSL 빌드가 존재하지 않는다. 규격 서브타입은 JOINED 상속 + **`spec_type` 불변**, JSONB는 Hibernate 7 네이티브 매핑, soft delete는 `@SoftDelete`, PK는 SEQUENCE 전략(ERD 변경 없이). 정본 `docs/adr/0006-persistence-jpa-conventions.md`.
- [DERO-134 패키지 구조 결정](DERO-134) — 톱레벨 도메인 패키지 9개(`user`·`catalog`·`auth`·`product`·`placement`·`community`·`commerce`·`image`·`infra`) + `global`. **리포지토리는 애그리거트 루트에만** — `Placement`(배치·책상·아이템)·`Product`(에셋·규격 서브타입·태깅)·`User`·`CartItem`·`GeneratedImage` + 마스터 6종. **쓰기는 루트 통과, 읽기는 자유.** 애그리거트 간 참조는 **객체 참조**(`@ManyToOne(LAZY)`), 넘는 연관에 `cascade` 금지. 포트 3곳은 `infra`에 인터페이스+구현. 의존 방향은 `user`·`catalog` 바닥에서 위로만, ArchUnit은 역류가 실제로 나면 도입. 정본 `docs/adr/0007-package-structure-and-aggregates.md`.
- [DERO-135 API 응답 규약 결정](DERO-135) — 성공 엔벨로프 **없음**(리소스 그대로 + 201·`Location`·204), 에러는 RFC 9457 `ProblemDetail` + `code` 확장 필드(검증 실패만 `errors` 배열). 에러 코드는 **도메인별 `ErrorCode` enum**(`global`엔 인터페이스만), 예외는 `BusinessException` 하나 — `ErrorCode`를 통과해야 한국어 `detail`이 보장되는 강제 장치다. 401·403은 공유 팩터리로 직접 배선(코드 4종 — 2026-07-30 DERO-277이 `AUTH_REFRESH_INVALID`를 더해 액세스 축과 리프레시 축을 갈랐다, `AUTH_SESSION_REVOKED`가 프론트 refresh 루프를 끊는다). 목록은 **사용자 대면 커서·관리자 offset**, 총 개수 없음. 프론트 타입은 springdoc 3.x → `openapi-typescript` 생성. 시각은 **`OffsetDateTime`**(ADR-0006 결정 6 부분 개정, `erd.md`의 `TIMESTAMPTZ`는 그대로). 정본 `docs/adr/0008-api-response-contract.md`.
- [DERO-177 배치 저장 페이로드 결정](DERO-177) — 페이로드는 **씬 전체 스냅샷**(델타 아님 — 서버가 판정하려면 어차피 전체가 필요). 영속화는 **id 매칭 병합**(통째 교체는 저장마다 `placed_item.id`가 바뀌어 아이템 단위 외부 참조 기능과 양립 불가). 참조는 **`ref` 통일**(DTO 전용, DB 컬럼 아님) + `mountedToRef`. 낙관적 락 **`@Version`은 `placement`에만**, 충돌 시 409 + 재로드 강제. **저장 게이트를 공개 게이트로 옮긴다** — 저장은 허용·경고, `PUBLIC` 전환만 422로 차단(기획 변경, 별도 티켓 190). `POST`(201+Location)/`PUT`(200), 응답에 `ref→id`·`version`·`violations`. 정본 `docs/adr/0009-placement-save-payload.md`.
- [DERO-192 환경 분리·시크릿 관리](DERO-192) — 프로파일 **파일 3개**(`application.yaml` 안전 기본값 = Swagger off / `-local` / `-prod`)로 **fail-closed** — 프로파일을 빠뜨려도 운영에 Swagger가 안 열린다. 운영 시크릿은 **루트 `.env.local` 확장**(경계선: 빌드가 쓰면 Jenkins credential, 컨테이너가 런타임에 읽으면 `.env.local`), 로컬은 **팀 공용 개발앱 1쌍 + 개인 `.env.local`**을 `spring.config.import: optional:file:./.env.local[.properties]`로. **함정 — `.env.local` 키는 셸 스타일이 아니라 Spring 프로퍼티 키여야 한다**(완화 바인딩은 환경변수 소스 전용, 틀리면 조용히 안 붙는다). 테스트는 `application-test.yaml` + Testcontainers `@ServiceConnection` + Flyway 켬. 타임존은 JVM `-Duser.timezone=Asia/Seoul` 3곳. 정본 `docs/adr/0010-environment-profiles-and-secrets.md`.
- [DERO-152 호환성 판정 위치 결정](DERO-152) — 프론트는 즉답 미러, WAS가 저장 시점 정본 재판정(위반 시 저장 거부). 대안 제시는 서버 전용, 판정 결과는 저장하지 않는다. 드리프트는 공유 fixture 계약 테스트(TS·Java)로 방어. 정본 `docs/adr/0004-judgment-frontend-mirror-server-authority.md`.
- **배치 업로드 비동기 파이프라인 결정** (2026-07-31 확정, 승인 박동규 · 티켓 없음 — 그릴링 세션 산출) — 게시 상태는 컬럼 하나(`publish_status` 4값)가 답하고, 전송은 **Redis 큐 + SSH 터널로 붙는 로컬 노트북 워커**다. gRPC 워커 풀·터널 인바운드는 부결(Boot 4 gRPC 비용 · Redis가 이미 떠 있음)했고 **Kafka/RabbitMQ 마이그레이션 여지는 `infra` AI provider 포트 뒤에 남겼다**. 워커는 자격증명 0(presigned URL을 메시지에 담는다), 유실은 `BLMOVE` + 처리중 리스트 + 스위퍼로 막는다. 상상도 3장 고정·`is_primary`가 피드 대표·한도는 장 단위. 정본 `docs/adr/0015-placement-upload-async-pipeline.md`. **스키마 3건이 같은 날 동결 언락으로 반영됐다**(`publish_status` 개명·4값 · `generated_image.is_primary` · `thumbnail_key` 용도 명시).
- **API 경로 전면 재설계** (2026-07-31 확정, 승인 박동규 · 티켓 없음) — 경로 규칙 5줄(동작 표현 2단·토글 단수 하위 리소스·부분집합은 쿼리·파일은 2단계 presign·관리자 별도 트리)에서 전 엔드포인트를 파생시켰다. `api-spec.md`는 **설계 의도 문서**로 성격을 굳혔고(필드 스키마는 springdoc OpenAPI가 정본, ADR-0008), 백엔드 controller/service/dto는 전량 삭제·재구현한다(`global/`·`auth`는 유지). 정본 `docs/context/api-spec.md`.
- [DERO-136 GLB 업로드 경로 결정](DERO-136) (2026-07-31 확정, 승인 박동규 — 131 미결 상태에서 선결정) — API 계약은 presign 2단계로 지금 고정, 발급은 `infra` `PresignPort` 뒤로(`app.storage.mode`: 기본 `local` = WAS HMAC 서명 URL + 로컬 볼륨 / `s3` = 기존 `S3PresignService`). 131 결정 시 포트 구현 교체 + 프로파일 스위치만 남는다(API·DB 무변경). 정본 `docs/adr/0016-glb-upload-presign-contract-local-port.md`. 관리자 등록·검수 API(312)가 첫 소비자다.
- **파일 서빙은 presigned URL 방식 — DB는 object key만 저장** (2026-07-29 확정, 승인 박동규 · 티켓 없음) — 우리 저장소 파일 9컬럼을 `_key` 접미사 + `VARCHAR(1024)`(S3 object key 최대 길이)로 두고, **완성 URL 조립은 WAS가 발급 시점에** 한다. 버킷·도메인·만료 정책 변경이 데이터 마이그레이션이 되지 않게 하기 위함 — 131이 어느 전달 경로를 고르든 DB 스키마는 그대로다. 외부 링크 2컬럼(`brand.brand_url`·`product.product_url`)은 남의 사이트 주소라 `_url`로 남는다(`user.profile_image_url`은 2026-07-29 D24 개정으로 `profile_image_key`가 됐다 — 우리가 자체 저장하고 제공자 사진은 받지 않는다). 접미사·타입 규약은 `docs/GLOSSARY.md`. **2026-08-11 부분 대체(ADR-0035)** — key만 저장·발급 시점 URL 조립 원칙과 업로드 presigned PUT은 그대로나, **조회(GET)는 presigned가 아니라 안정 공개 URL로 조립한다**.

- **이미지 조회는 안정 공개 URL + 전면 webp** (2026-08-11 확정, 승인 박동규 · 에픽 DERO-570) — SEO(이미지 색인)·Lighthouse가 근거다. presigned GET은 15분 만료·조회마다 URL 재생성이라 구글봇 색인 불가·브라우저 캐시 전멸·`next/image` 불가(원격 47곳이 맨 `<img>`)였다. WAS 공개 스트리밍 GET + `Cache-Control: immutable` + nginx `proxy_cache`로 바꾸고, 덮어쓰기 key 2종(프로필·배치 썸네일)은 uuid 버전화로 immutable과 정합을 맞춘다. 저장 포맷은 프론트 변환 + presign MIME 제한으로 webp 통일, 기존분은 **DB 키 기준**(본문 마크다운 인라인 키 포함) 일괄 마이그레이션. CloudFront·버킷 정책은 AWS 콘솔 부재로 부결 — CDN이 열리면 호스트 교체만으로 이행된다. 정본 `docs/adr/0035-stable-public-image-url-and-webp.md`.

- **관측·로깅 최소선** (2026-08-03 확정, 승인 박동규 · 에픽 DERO-382) — 지표는 **Prometheus + Grafana**, 로그는 **Filebeat → ES → Kibana**로 역할을 가른다. Spring Boot 4.1 내장 ECS JSON이라 파싱할 게 없어 **Logstash 없이 Filebeat 직결**이고, Filebeat 파일 오프셋이 이미 버퍼라 **Kafka 버퍼도 넣지 않는다**. 외부 노출은 **Grafana 하나**(서브도메인+로그인)고 나머지는 `127.0.0.1` + SSH 터널 — 로그에 토큰 조각이 섞이기 때문이다. compose는 **3계층**(`compose.observability.yaml`, 수동 적용). 로그 30일·검색어 이벤트 1년 ILM. ES 도입 자체는 검색 요구가 근거다([ADR-0019](../adr/0019-search-elasticsearch-nori.md)). 정본 `docs/adr/0020-observability-stack.md`, 배선은 `docs/context/observability.md`.

- **무중단 배포는 blue-green + 마이그레이션은 확장/축소** (2026-08-06 확정, 승인 박동규 · DERO-469) — 고른 이유는 무중단이 아니라 **되돌리기 비용**이다. 종전 `docker compose up -d`는 새 이미지가 부팅에 실패하면 옛 컨테이너가 이미 없어 **서비스가 내려간 채 남고** 복구가 사람 손이었다. 색 두 벌(blue 3000/8081 · green 3010/8091)을 같은 EC2에 올리고 **호스트 nginx upstream 심볼릭 링크 하나**로 넘긴다 — 링크가 곧 상태라 따로 적지 않는다. compose 파일은 한 벌이고 색은 프로젝트 이름(`-p dero-blue`)이 정한다. **대가가 진짜 결정이다: Flyway가 헬스 게이트보다 먼저 운영 DB에 커밋하므로**(green 부팅 시점) 배포가 뒤에 실패해도 스키마는 안 돌아온다 — 파괴적 변경은 배포 2회로 갈리고 이를 `Jenkinsfile`의 `Validate Migrations`가 강제한다. k8s/ALB·롤링·카나리·색별 DB 전부 부결. 정본 `docs/adr/0026-blue-green-deploy-and-expand-contract-migration.md`, 배선은 `docs/context/deployment.md` §4-1.

## 아직 못 박은 것 (안개)

지금은 질문을 또렷하게 못 세우는 것들. 앞의 결정이 풀리면 티켓으로 졸업시킨다.

- ~~**nginx가 비공개 S3에 붙는 방법** — SigV4 서명이 필요한데 nginx 단독으로는 어렵다. 131이 프록시 경로(A·B안)를 고르면 그때 티켓이 된다.~~ **종결 (2026-08-11, ADR-0035)** — nginx가 S3에 직접 붙지 않는다. WAS가 SDK로 스트리밍하고 nginx는 `proxy_cache`로 그 앞을 덮는다.
- **CloudFront 커스텀 도메인·ACM 절차** — 131이 CloudFront 경로(C·D안)를 고르면 그때.
- **리버스 프록시·도메인·HTTPS 배선** — **CI/CD 자체는 안개가 아니다.** Jenkins가 같은 EC2에서 빌드·배포하고 compose 계층(`dero` 앱 / `dero-data` postgres·redis, 여기에 `dero-observability`가 더해진다 — ADR-0020)이 이미 돈다(ADR-0010 맥락). 남은 건 131이 에셋 경로를 고른 뒤의 nginx·도메인·인증서다.
- **OpenAPI 타입 생성의 CI 자동화** — ADR-0008이 생성을 수동으로 두고 미뤘다. Jenkins 파이프라인은 이미 있으니 스테이지 하나를 붙이는 일인데, 프론트 빌드 시점에 백엔드가 떠 있어야 해서 순서 설계가 남았다.
- **크래시·탭 종료 시 작업물 보호** — 디바운스 자동 스냅샷. 지금 요구사항에 없어 177에서 뺐다. 넣으려면 **저장 게이트 개정([190](DERO-190))이 먼저다** — 편집 중간 상태는 대개 위반이라, 게이트가 살아 있으면 자동 저장이 계속 거부된다.
- **에셋 검수 워크플로 상태 저장** (REQ-ADM-04).
- **데스크 피드에 누구의 배치를 보여주나** (2026-07-31 추가) — 전체 최신·팔로잉·인기순. 화면 요구가 또렷해지면 티켓이 된다. `idx_placement_publish_status_like_count`가 인기순은 이미 준비돼 있다.
- **AI 상상도 한도의 결제 확장 모델** (2026-07-31 추가) — 구독형(월정액 → 상한 상향)인지 크레딧형(장수 충전)인지. 둘은 데이터 모델이 다르지만 지금 만든 셋(한도 판단 지점 1곳 · `GET /users/me/image-quota` · 429 `IMAGE_QUOTA_EXCEEDED`)은 어느 쪽이 와도 재사용된다. **지금 고르면 근거 없는 추측이 스키마에 박힌다.**
- **큐를 Kafka/RabbitMQ로 옮기는 시점** (2026-07-31 추가) — Redis 리스트는 큐로서 최소한이다(컨슈머 그룹·재처리·DLQ·관측이 전부 손으로 짠 것). 워커가 여러 대가 되거나 작업 종류가 늘거나 유실 추적이 필요해지면 옮긴다. 바뀌는 것은 `infra`의 AI provider 포트 구현 하나다(ADR-0015 결정 2). **후보에서 Kafka는 빠졌다** (2026-08-03, [ADR-0019](../adr/0019-search-elasticsearch-nori.md) "Kafka도 같이 부결한다") — 우리 워크로드는 이벤트 스트림이 아니라 **작업 큐**라 폴 인터벌·파티션 상한·건별 ack 부재가 전부 어긋나고, 워커가 SSH 터널 뒤라 `advertised.listeners` 재접속이 깨진다. 옮긴다면 **Redis Streams 또는 RabbitMQ** 방향이다. **이관 트리거 자체는 여전히 미결이고, MQ 채택은 별도 ADR이다.**
- **자체 상상도 모델의 3장 생성 시간** (2026-07-31 추가) — 스위퍼 타임아웃 10분·작업용 presign TTL 30분이 전부 이 값에 달린 잠정치다. 138이 폐기되면서 이 실측만 남았다.

## 범위 밖

- **오토스케일·다중 인스턴스·부하 테스트** — EC2 1대가 확정 제약이라 스케일아웃 설계는 이 맵의 목적지 너머다.
- **Kubernetes·서비스 메시** — 같은 이유.
