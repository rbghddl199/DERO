# 0016 — GLB 업로드: presign 계약 선고정 + 스토리지 포트 로컬 구현

## 상태

확정 (2026-07-31, 승인 박동규 — 그릴링 세션. DERO-136 선결정, 관련 티켓 312)

## 맥락

관리자 에셋 등록 도구(에픽 DERO-310)는 GLB 업로드 없이는 성립하지 않는데, 업로드 전송
경로 결정(136)은 에셋 전달 경로(131) ← 인프라 사실 확인(137, 진행 중)에 이중으로 막혀 있었다.
운영에는 오브젝트 스토리지가 아직 없고(deployment.md에 S3 흔적 0), 로컬 개발에는 S3 자격증명이
없어 기존 `S3PresignService`(구체 `@Component`, 포트 아님)로는 presign 경로가 아예 돌지 않았다.
한편 DB는 2026-07-29 결정으로 이미 `_key`만 저장해 전달 경로 결정과 분리되어 있었다.

## 결정

1. **API 계약은 presign 2단계로 지금 고정한다** (api-spec §1 규칙 4 그대로) —
   `POST …/upload-url`(200) → 클라이언트 PUT → key 등록. 131이 어느 경로를 골라도 이 계약은
   안 바뀐다.
2. **presign 발급을 `infra` 포트(`PresignPort`) 뒤로 숨긴다.** `S3PresignService`는
   `app.storage.mode=s3`일 때의 구현이 되고, 기본값 `mode=local`에서는 `LocalPresignService`가
   WAS 자신이 HMAC 서명한 URL(`/api/v1/local-files/{*key}?exp=&sig=`)을 발급하며
   `LocalFileController`가 받아 로컬 볼륨(`StoragePort`)에 넣고 뺀다.
3. 131(전달 경로)이 결정되면 **포트 구현 교체 + 프로파일 스위치**가 이행의 전부다 — API·DB·
   프론트 무변경.

## 대안과 버린 이유

- **B. WAS multipart 직접 업로드** — 지금은 단순하지만 §1 규칙 4(파일은 2단계 presign)를 어기는
  두 번째 방식이 생기고, 131 결정 후 API 계약을 갈아엎어야 한다. 계약 파괴 비용이 로컬 서명
  구현 비용보다 크다.
- **C. 137·131 결정까지 대기** — 등록 도구 전체가 외부 티켓에 무기한 블로킹된다. 스키마·계약이
  이미 경로 중립이라 기다려서 얻는 정보가 구현 형태를 바꾸지 않는다.

## 파급

- `infra`: `PresignPort` 신설, `LocalPresignService`·`LocalFileSigner`·`LocalFileController` 추가,
  `LocalFileStoragePort` 부활(유일 호출자는 `LocalFileController` — 도메인은 `PresignPort`만 안다).
  서명 규칙·함정은 `infra/CLAUDE.md`.
- 소비자 3곳(`UserService`·`ProductImageService`·`PlacementService`)은 `PresignPort` 타입으로 전환.
- **남는 일(131 이후)**: prod 프로파일에서 `mode=s3` 또는 `local-base-url`(실도메인)·
  `local-sign-secret`(환경변수) 오버라이드. 지금 prod가 mode=local로 뜨면 발급 URL 오리진이
  `localhost:8080`이라 틀리다. 전체 잠금 복원(282) 때 `/api/v1/local-files/**`를 permitAll
  목록에 넣어야 한다(인가가 Bearer가 아니라 서명이다).
- `app.storage.mode` 오타는 조용히 local로 떨어진다(`matchIfMissing=true`) — enum 바인딩·부팅
  검증은 s3 전환 시점에 같이 넣는다.
