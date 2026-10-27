# 0035. 이미지 조회는 안정 공개 URL, 저장은 전면 webp

## 상태

확정 (2026-08-11, 승인 박동규) · 개정 (2026-08-11, 승인 박동규 — 결정 4 화질 q82·GMS 근거 정정, 결정 6 1280px 상한 명시, [583](DERO-583)) · 에픽 DERO-570
관련: [ADR-0016(glb-upload)](0016-glb-upload-presign-contract-local-port.md) — 업로드 presign 2단계 계약은 이 ADR이 건드리지 않고 유지한다. `architecture-map.md` "파일 서빙은 presigned URL 방식"(2026-07-29) 결정 중 **조회(GET) 절반을 대체**한다.

## 맥락

SEO·Lighthouse 최적화가 목표가 되면서 이미지 서빙의 전제가 바뀌었다.

- 조회가 전부 **15분 만료 presigned GET**이고 조회마다 URL이 재생성된다. 구글봇이 색인한 URL은 재방문 시 403 — 이미지 검색 노출이 0이다. 브라우저 캐시도 URL이 매번 달라 전멸하고, Lighthouse 캐시 정책 항목이 확정 감점이다.
- presigned URL은 호스트가 환경마다 달라 `next/image` remotePatterns 등록이 불가 — 원격 이미지 47곳이 맨 `<img>`다(`CollectionCoverImage.tsx:7-10` 주석이 이 제약을 명시).
- 저장 포맷은 png/jpg 중심이고 서버측 이미지 처리(리사이즈·변환)는 존재하지 않는다. 업로드 바이트는 WAS를 통과하지 않는다(presigned PUT 직행).
- 제약: **AWS 콘솔 접근이 없다**(EC2와 SDK 자격증명만) — CloudFront 생성, 버킷 정책 변경이 불가하다.

## 결정

1. **조회는 안정 공개 URL로 전환한다.** WAS에 공개 스트리밍 엔드포인트(GET, `StoragePort.load` 기반)를 두고 `Cache-Control: public, max-age=31536000, immutable`을 붙인다. nginx `proxy_cache`가 WAS 부하를 흡수한다. 응답 DTO의 이미지 URL 조립부는 presignGet 대신 이 고정 URL을 낸다. **업로드 presigned PUT은 그대로다.**
2. **전 이미지 프리픽스를 공개로 취급한다.** key에 uuid가 있어 열거 불가하고, 전부 서비스 화면에서 공개 노출되는 콘텐츠다.
3. **key 불변 원칙을 전 프리픽스로 통일한다.** 덮어쓰기 2종(`profile-images/{userId}.{ext}`, `placement-thumbnails/{placementId}.png`)도 업로드마다 uuid 버전 key를 발급한다 — immutable 캐시와 덮어쓰기는 양립 불가. 옛 오브젝트는 고아로 남는다(오브젝트 정리 부재는 기존과 동일 상태).
4. **저장 포맷은 webp로 통일한다.** 프론트가 업로드 전 변환(canvas, 미지원 브라우저는 wasm 인코더 폴백, lossy q82 — 제품 색 조화를 눈으로 판단하는 도구라 q75·q80보다 높다, DESIGN-SYSTEM §1.5)하고, presign 발급 MIME 허용표를 `image/webp`로 좁혀 강제한다. SVG(벡터)·KTX2(텍스처)는 대상 아님. **GMS 상상도 경로는 이 결정이 닿지 않는다** — 서버가 만들어 S3에 직접 넣으므로 프론트 변환 경로 밖이고, prod는 이미 real 모드다(`IMAGE_GENERATION_MODE=gms`, 2026-08-11 실측 — 이 줄은 당초 "prod가 stub이라 제외"라고 적었으나 사실이 아니었다). 기존 상상도는 결정 6이 정리하지만 **신규는 계속 PNG로 쌓인다**: 서버측 변환은 별도 티켓(DERO-584).
5. **프론트 원격 이미지는 next/image로 통일한다.** 호스트가 자체 도메인 하나로 고정되므로 remotePatterns 등록이 가능해진다. srcset·사이즈 지정(CLS)·lazy까지 확보.
6. **기존 오브젝트는 일괄 마이그레이션한다.** 신규 업로드 webp화 코드 배포가 먼저, 그 뒤 Node(sharp) 스크립트로 변환하며 **긴 변 1280px 상한을 함께 적용한다**(신규 업로드와 같은 값 — 이관본만 크면 화질·용량이 갈린다. 유저 전송량은 next/image가 이미 줄이므로 이 상한이 겨냥하는 것은 WAS 힙·nginx 캐시·Next 최적화기 CPU다). **내용이 이미 목표 상태(webp·1280 이하)면 재인코딩하지 않고 바이트를 그대로 옮긴다** — 2026-08-05 백필이 라이브 key에 webp 내용을 덮어써 둔 오브젝트가 314개 있어(key는 `.png`인데 내용은 webp) 그대로 변환하면 손실 압축이 2세대가 된다. **스캔 기준은 S3 프리픽스가 아니라 DB다** — `*_key` 컬럼 전체 + 본문 마크다운 인라인 이미지 키(`post.content`·`desk_feed.content`의 `![alt](key)`, 크로스 프리픽스 행 존재: V12가 재이관한 `desk_feed_image`가 `post-images/`를 참조). 원본은 `_backup-pre-webp/` 프리픽스에 보존, 시각 QA 통과 후 일괄 삭제.

## 대안과 버린 이유

- **presigned GET 유지 + webp만 전환** — 포맷 항목 하나 얻고 캐시·색인은 계속 잃는다. SEO 목표와 정면충돌.
- **버킷 공개 정책 / CloudFront** — AWS 콘솔 접근이 없어 실행 불가. 단 이 설계는 CDN이 열리면 URL 호스트 교체만으로 이행된다(안정 URL 인터페이스는 동일).
- **백엔드 업로드 프록시에서 서버 변환** — presign 2단계 계약(ADR-0016) 파기 + Java 표준에 webp 인코더 부재(외부 바이너리/라이브러리 필요). 변경 비용이 프론트 변환 대비 크다.
- **덮어쓰기 프리픽스만 짧은 캐시** — 캐시 정책이 이원화되고 해당 이미지는 캐시 이득을 못 본다. key 버전화가 규칙 하나로 전 프리픽스를 덮는다.

## 파급

- BE: 공개 이미지 GET 컨트롤러 1개 신설, presignGet 조립부 교체, 이미지 presign MIME 표 `image/webp` 제한(→ DERO-571·[574](DERO-574)). MIME 작업은 MR !508(568, DeskFeed post parity) 머지 후 기준.
- BE 결함 동반 수정: `ProductImageService`·`AdminBrandService`의 클라이언트 fileName 확장자 무검증 결합 → MIME표 방식 통일([575](DERO-575)).
- FE: 원격 이미지 공용 컴포넌트(next/image) 수렴([572](DERO-572)), 업로드·캔버스 캡처 webp 변환([573](DERO-573)), `src/assets` png 26.6MB webp화([577](DERO-577)).
- Infra: nginx 이미지 location + proxy_cache, 마이그레이션 스크립트([576](DERO-576)) — 실행 전 정정 [583](DERO-583).
- 후속: GMS 상상도 서버측 webp 변환([584](DERO-584)) — 결정 4가 닿지 않는 유일한 업로드 경로.
- 검증: 홈·제품 상세·데스크피드 목록 Lighthouse(Performance·SEO) 전/후 측정, 재방문 캐시 히트 확인.
- 문서: `architecture-map.md` 조회 결정 개정, 안개 "nginx가 비공개 S3에 붙는 방법" 종결.

## 실행 결과 (2026-08-11)

배포·운영 이관까지 끝났다. 실측만 적는다.

| | 전 | 후 |
|---|---|---|
| 이미지 프리픽스 합계 | 225.3 MB | **38.9 MB** (−83%) |
| 이관 대상 | 494개 | 157.9 MB → 20.9 MB (−86.8%) |

- **key 확장자로 포맷을 판정하면 틀린다.** 2026-08-05 백필이 라이브 key(`.png`)에 webp 내용을 덮어써 둔 오브젝트가 314개였다 — 결정 6의 sniff 분기가 이들을 재인코딩 없이 통과시켰다(2세대 손실 회피).
- 검증: 안정 URL 200 + `content-type: image/webp` + `immutable`, nginx `X-Cache-Status` MISS→HIT, next/image 최적화 200. 재드라이런에서 **남은 변환 대상 0**(DB 참조 513개 중 511개가 webp, 나머지 2개는 아래 blob).
- 원본·백업(`_backup-pre-webp/` 494개)과 2026-08-05 백필 백업(`originals/` 314개 504.9MB)은 시각 QA 통과 후 삭제했다. **되돌릴 원본은 없다.**
- **고아 오브젝트 283개(30.4MB)도 같이 지웠다.** DB가 참조하지 않는 이미지로, 이 ADR이 "오브젝트 정리 부재는 기존과 동일 상태"라고 적어 둔 그 잔여물이다. 판정은 결정 6과 같은 참조 수집 로직 + 24시간 유예(confirm 대기 중인 업로드 보호). 정리 자체는 일회성이고 상시 도구는 여전히 없다.
- 남은 이물: `post` 302·303 본문의 `blob:https://…` 2건 — 에디터 objectURL이 저장된 것이라 대응 오브젝트가 없고 이미 깨져 있다. 콘텐츠 판단이라 손대지 않았다.
- Lighthouse 전/후 측정은 하지 않았다(배포를 서둘러 "전" 값을 못 남겼다).
