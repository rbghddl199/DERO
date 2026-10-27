# 에셋 전달 인프라 조사 (DERO-127)

- 조사일: 2026-07-24
- 조사 방법: AWS 공식 문서(docs.aws.amazon.com)·공식 가격 페이지(aws.amazon.com)·AWS Price List API를 1차 출처로 삼음. 가격 수치는 AWS Price List 공개 엔드포인트에서 직접 추출. 블로그·커뮤니티는 보조로만 사용하고 그 경우 명시함.
- 목적: 브라우저가 GLB 에셋을 받아가는 경로의 **가능·불가능**과 **비용 한도**를 사실로 확정한다. 결정은 DERO-131에서 사람이 한다.
- 전제(재조사 안 함): 교육기관 제공 EC2 1대 + 개인 AWS 계정. 원본 GLB 20~30MB, 압축 목표 100~500KB/에셋, 초기 로드 예산 3MB (`docs/context/asset-pipeline.md`).
- **이 문서에는 결론·추천이 없다.** 마지막의 "선택지와 대가" 표까지가 전부다.

---

## 1. S3 버킷 정책을 IP 조건으로 잠그면 브라우저가 직접 GET 할 수 있나

### 사실

- `aws:SourceIp`는 **요청을 보낸 쪽의 공인 IP**와 정책에 적은 IP를 비교한다. AWS IAM 문서 원문: *"Use this key to compare the requester's IP address with the IP address that you specify in the policy. The `aws:SourceIp` condition key can only be used for public IP address ranges."*
- 따라서 버킷 정책이 `IpAddress: {"aws:SourceIp": "<EC2 탄력적 IP>/32"}`로 잠겨 있으면, **요청자가 EC2일 때만 통과**한다. 브라우저가 S3 URL을 직접 치면 요청자는 최종 사용자의 ISP IP이므로 조건에 걸려 거부된다(403).
- AWS가 제시하는 IP 조건 버킷 정책 예시(그대로 인용):

```json
{
    "Version":"2012-10-17",
    "Id": "S3PolicyId1",
    "Statement": [
        {
            "Sid": "statement1",
            "Effect": "Allow",
            "Principal": "*",
            "Action":"s3:GetObject",
            "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/*",
            "Condition" : {
                "IpAddress" : { "aws:SourceIp": "192.0.2.0/24" },
                "NotIpAddress" : { "aws:SourceIp": "192.0.2.188/32" }
            }
        }
    ]
}
```

- 즉 이 구성에서 **에셋은 전량 WAS(EC2)를 경유한다.** EC2가 S3에서 받아 사용자에게 다시 내보내는 구조가 강제된다. (아키텍처 맵 §제약·메모에 적힌 "알려진 함정"이 문서로 확인된다.)
- 부가 함정 두 가지가 같은 문서군에 명시돼 있다:
  - VPC 엔드포인트를 통해 온 요청에는 `aws:SourceIp` 키가 **아예 존재하지 않는다.** 이 경우 `aws:VpcSourceIp` / `aws:SourceVpce`를 써야 한다.
  - AWS 서비스가 사용자를 대신해 호출하는 경우(service-to-service) 네트워크 관련 컨텍스트가 삭제되므로, `Deny` 문에 `aws:SourceIp`를 쓰면 서비스 프린시펄이 의도치 않게 차단될 수 있다. AWS는 `aws:PrincipalIsAWSService: false`를 함께 걸라고 안내한다. — **이 함정은 CloudFront를 붙일 때 직접 걸린다.**

### 출처

- <https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html> (aws:SourceIp)
- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/amazon-s3-policy-keys.html> ("Example 1: Granting `s3:GetObject` permission with a condition on an IP address")
- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html> ("Network path restriction" 절 — 공개 엔드포인트는 `aws:SourceIp`, VPC 엔드포인트는 `aws:SourceVpc`/`aws:SourceVpce`)

### 불확실한 부분

- 없음. 이 항목은 문서상 명확하다. 다만 **"IP로 잠그되 특정 프리픽스만 공개"** 같은 혼합 정책(예: `assets/` 프리픽스는 익명 GET 허용, 나머지는 IP 제한)은 정책 문법상 가능하며 이 조사에서 별도로 검증하지 않았다.

---

## 2. CloudFront + OAC로 S3를 비공개로 두면서 브라우저 직배신이 되는가

### 사실

- **된다.** OAC(Origin Access Control)의 정의 자체가 "S3 버킷을 비공개로 유지하면서 지정한 CloudFront 배포를 통해서만 접근을 허용"하는 것이다. CloudFront 플랜 기능표에도 Free 티어 포함 전 티어에서 **OAC = Yes**로 명시돼 있다.
- 브라우저는 S3 도메인이 아니라 CloudFront 도메인(`d111111abcdef8.cloudfront.net` 또는 커스텀 도메인)으로 요청한다. CloudFront가 엣지에서 SigV4로 서명해 S3에 대신 요청한다. 사용자 IP는 S3 정책 평가에 등장하지 않는다.
- **필요한 설정 요소(문서에 명시된 것만):**
  1. **일반 S3 버킷 오리진**이어야 한다. S3 정적 웹사이트 엔드포인트로 설정된 버킷은 커스텀 오리진이 되어 **OAC를 쓸 수 없다.**
  2. **S3 Object Ownership = Bucket owner enforced** (신규 버킷 기본값). ACL이 필요하면 Bucket owner preferred.
  3. **버킷 정책**에 CloudFront 서비스 프린시펄 허용 + `AWS:SourceArn`으로 배포 한정:

```json
{
  "Version":"2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipalReadOnly",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::111122223333:distribution/<배포 ID>"
        }
      }
    }
  ]
}
```

  4. **OAC 리소스 생성** — `OriginAccessControlOriginType: s3`, `SigningProtocol: sigv4`, **`SigningBehavior: always`** (콘솔의 "Sign requests (recommended)"). AWS 원문: *"communication between CloudFront and Amazon S3 is always through HTTPS, but only when you choose to always sign requests."*
  5. 배포의 S3 오리진에 OAC를 붙인다(`OriginAccessControlId`).
  6. SSE-KMS로 암호화한 객체라면 **KMS 키 정책**에 CloudFront 프린시펄용 `kms:Decrypt` 등을 추가해야 한다. (SSE-S3 기본 암호화면 불필요.)
- **OAC vs OAI**: AWS는 OAC를 권장한다. OAI는 (a) 2023년 1월 이후 신규 리전, (b) SSE-KMS, (c) S3로의 동적 요청(PUT/POST/DELETE)을 지원하지 않는다. OAC는 PUT/DELETE도 지원한다 → **CloudFront 경유 업로드도 이론상 가능**(6번 항목과 함께 볼 것).
- **브라우저 CORS 함정(별도 설정 필요):** Three.js `GLTFLoader`는 `fetch`/XHR로 GLB를 가져오므로 CORS 응답 헤더가 필요하다. CloudFront가 기본 캐시 정책으로 동작하면 `Origin` 헤더를 오리진에 전달하지 않아 S3가 CORS 헤더를 붙이지 않는다. AWS 관리형 오리진 요청 정책 **`CORS-S3Origin`**(ID `88a5eaf4-2fd4-4709-b370-b4c650ea3fcf`)이 `Origin`·`Access-Control-Request-Headers`·`Access-Control-Request-Method`를 전달한다. 이걸 캐시 동작에 붙이고, S3 버킷 CORS도 함께 설정해야 한다.
- **OAC 관련 운영 주의:** OAC가 붙은 배포를 지울 땐 **배포를 먼저 지우고 S3 버킷을 지운다**(순서 반대면 문제).

### 출처

- <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html> (OAC 전체 절차·버킷 정책·KMS·OAI 비교·삭제 순서)
- <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html> (기능표 — Free 플랜에도 OAC 포함)
- <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html> (`CORS-S3Origin` 정의)
- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html> (S3 CORS 평가 규칙)

### 불확실한 부분

- **CloudFront 배포는 개인 계정에 만들고, 교육기관 EC2는 손대지 않는 구성**이 되는지는 문서상 막는 게 없지만 실제로 붙여본 검증은 이 조사 범위 밖이다. 커스텀 도메인을 쓸지(ACM 인증서는 반드시 `us-east-1`) 기본 `*.cloudfront.net`을 쓸지에 따라 절차가 갈린다 — **미검증**.
- CloudFront 배포 생성/전파 시간, 캐시 무효화 운영 부담은 수치로 확인하지 않았다.

---

## 3. CloudFront 프리티어 2026년 현재 실제 한도

**이 항목이 이번 조사에서 가장 크게 바뀐 지점이다. 2025년 11월에 CloudFront에 "정액제 플랜"이 새로 생겨서, 지금은 서로 다른 두 개의 "무료"가 동시에 존재한다.**

### 사실 A — 기존 "CloudFront Free Tier" (종량제 위에 얹히는 것)

- 한도: **매월 데이터 전송 1TB + HTTP/HTTPS 요청 10,000,000건 + CloudFront Functions 호출 2,000,000건.** (2021-12-01부터)
- **기간 제한 없음.** AWS FAQ 원문: *"Starting Dec 1 2021, all AWS customers will receive 1 TB of data transfer out, 10,000,000 HTTP/HTTPS requests, plus 2,000,000 CloudFront Functions invocations each month for free."* — "12개월"이라는 단서가 없고 "all AWS customers"·"each month"다.
- **제외되는 사용 유형**(원문 열거): Invalidations, Proxy requests, Lambda@Edge, Origin Shield, **Data Transfer to Origin**.
- 전 엣지 로케이션 합산이며, 초과분은 표준 종량 요금.
- Consolidated Billing을 쓰면 **조직당 프리티어 1개**다.
- 초과 시 종량 요금(AWS Price List API에서 직접 추출, 2026-07-24 기준):

| 리전 그룹 | 첫 10TB | 다음 40TB | HTTPS 요청 (Tier2 GET/HEAD) |
|---|---|---|---|
| Asia Pacific (한국 엣지 포함) | $0.120/GB | $0.100/GB | $0.0000012/건 (= $1.20/백만) |
| Japan | $0.114/GB | $0.089/GB | $0.0000012/건 |
| United States | $0.085/GB | $0.080/GB | $0.0000010/건 |

- 오리진으로 되돌아가는 전송(Data Transfer to Origin)은 Asia $0.060/GB — **프리티어 제외 항목이다.**

### 사실 B — 신규 "정액제 플랜(flat-rate)"의 Free 플랜

- 2025년 11월 도입. 티어는 **Free($0) / Pro($15) / Business($200) / Premium($1,000)** — 월정액.
- Free 플랜 월 사용 허용량: **요청 1,000,000건 / 데이터 전송 100GB / S3 스토리지 크레딧 5GB / WAF 룰 5개 / 캐시 동작 5개 / Route 53 레코드 50개.**
- **허용량은 하드 리밋이 아니고, 초과해도 과금이 없다.** AWS 원문: *"you will not incur overage charges, regardless of how much you exceed your allowance."* 대신 지속적으로 크게 초과하면 AWS가 **전달 품질을 조정할 수 있다**(더 적거나 먼 엣지에서 서빙). 첫 스파이크는 허용량의 3배까지 그 달에 영향 없음.
- **플랜 1개 = 배포 1개 + 루트 도메인 1개.** 계정 단위가 아니다.
- 플랜에 CloudFront CDN + WAF/DDoS + Route 53 DNS + CloudWatch Logs 수집 + TLS 인증서 + 서버리스 엣지 컴퓨트 + S3 스토리지 크레딧이 묶여 있다.
- **A와 B는 다른 제도다.** AWS FAQ 원문: *"The CloudFront Free Tier is different — it applies only to CloudFront usage under pay-as-you-go pricing. While it provides 1TB of data transfer and 10 million requests free each month across your account, any usage beyond these limits is billed at standard pay-as-you-go rates."*
- 즉 **종량제를 고르면 1TB/10M(초과 시 과금), 정액 Free 플랜을 고르면 100GB/1M(초과해도 과금 없음, 대신 성능 조정 가능)**이다. 프로젝트 규모(초기 로드 3MB)로 환산하면 1TB ≈ 33만 회 초기 로드, 100GB ≈ 3.3만 회 초기 로드에 해당한다(단순 나눗셈, 캐시 히트·부분 로드 무시).

### 출처

- <https://aws.amazon.com/cloudfront/faqs/> ("What usage types are covered in the AWS free tier for Amazon CloudFront?", "How does the Free flat-rate Plan differ from the CloudFront Free Tier?", "If we sign-up for Consolidated Billing…")
- <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html> (플랜 기능표·월 사용 허용량·초과 시 처리·"one distribution with up to one apex domain")
- <https://aws.amazon.com/cloudfront/pricing/> (Free/Pro/Business/Premium 가격표)
- <https://aws.amazon.com/about-aws/whats-new/2025/11/aws-flat-rate-pricing-plans/> (2025-11 도입 발표)
- 종량 요금 수치: <https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.json> (AWS Price List API, `AP-DataTransfer-Out-Bytes` / `AP-DataTransfer-Out-OBytes` / `*-Requests-Tier2-HTTPS`)

### 불확실한 부분

- **CloudFront 종량제 프리티어(1TB/10M)가 2025-07-15 이후에 만든 신규 계정에도 그대로 적용되는지 1차 출처로 확정하지 못했다.** AWS 프리티어 페이지는 "30개 이상 서비스가 Free/Paid 플랜 양쪽에서 always free"라고만 하고 서비스별 목록을 JS로 렌더링해서 스크래이핑에 실패했다. CloudFront FAQ는 "all AWS customers"라고 쓰지만 이 문장은 2021년 것이고 2025년 프리티어 개편 이후 갱신 여부가 불명확하다. → **개인 계정을 실제로 만든 뒤 Billing 콘솔의 프리티어 사용량 화면에서 확인해야 한다.**
- 정액 Free 플랜에서 "성능 조정"이 구체적으로 어떤 수준인지 AWS가 수치로 밝히지 않는다(원문도 "we may adjust how we deliver your traffic" 수준).

---

## 4. S3 프리티어 한도

### 사실

- **아웃바운드 전송 100GB/월은 계정 나이와 무관한 상시 무료다.** S3 가격 페이지 원문: *"AWS customers receive 100GB of data transfer out to the internet free each month, aggregated across all AWS Services and Regions (except China and GovCloud). The 100 GB free tier for data transfer out to the internet is global and does not apply separately or individually to AWS Regions."*
  - **주의: 전 AWS 서비스 합산이다.** EC2 아웃바운드와 S3 아웃바운드가 같은 100GB를 나눠 쓴다.
- **아예 과금되지 않는 전송**(S3 가격 페이지 열거):
  - 인터넷 → S3 인바운드 (업로드는 전송비 0)
  - 같은 리전 내 S3 버킷 간 전송
  - **S3 버킷 → 같은 리전의 다른 AWS 서비스 (다른 계정이어도 같은 리전이면 무료)** ← 크로스 계정 구성에서 결정적
  - **S3 → CloudFront 전송 (무료)**
- ap-northeast-2(서울) 종량 단가 (AWS Price List API 추출, 2026-07-24):

| 항목 | 단가 |
|---|---|
| S3 Standard 스토리지 (첫 50TB) | $0.025 / GB·월 |
| GET 및 기타 요청 | $0.00000035 / 건 (= $0.35 / 백만) |
| PUT·COPY·POST·LIST 요청 | $0.0000045 / 건 (= $4.50 / 백만) |
| 인터넷 아웃바운드 (100GB 초과분, 첫 10TB) | $0.126 / GB |

- **"5GB 스토리지 / 20,000 GET / 2,000 PUT"의 12개월 프리티어는 2025-07-15 이후 신규 계정에는 해당되지 않는다.** S3 가격 페이지 원문: *"As of July 15, 2025, new AWS customers will receive up to $200 in AWS Free Tier credits… At account sign-up, you can choose between a free plan and a paid plan. The free plan will be available for 6 months after account creation."*
- **2025-07-15 이후 신규 계정의 프리티어 구조**(AWS Billing 문서 원문 기반):
  - 가입 즉시 **$100 크레딧**, 활동 완료로 **최대 $100 추가** → 최대 $200.
  - **Free 플랜**: 6개월 또는 크레딧 소진 중 먼저 오는 시점에 **계정이 자동으로 닫힌다.** 콘텐츠는 90일 보관 후 영구 삭제. 90일 안에 Paid 플랜으로 업그레이드하면 유지.
  - **Paid 플랜**: 크레딧 소진돼도 계정이 닫히지 않고, 초과분은 종량 과금. 모든 서비스·기능 접근. 단기 체험(short-term trial) 제공 대상.
  - 크레딧은 **계정 생성 12개월 안에** 다 써야 한다.
  - Free 플랜은 AWS Organizations 가입·Control Tower·APN 가입 등을 하면 자동으로 Paid로 승격된다.
  - 양쪽 플랜 모두 "Always free" 서비스 사용량 한도는 받는다.
- 2025-07-15 **이전**에 만든 계정은 레거시 프리티어(단기 체험 + 12개월 + always free)를 그대로 유지한다.

### 출처

- <https://aws.amazon.com/s3/pricing/> (100GB 상시 무료 문구, 과금 제외 전송 목록, 2025-07-15 크레딧 안내)
- <https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html> (Free/Paid 플랜 비교표, 6개월·90일·자동 승격 조건)
- <https://aws.amazon.com/free/> (최대 $200 / 6개월 / 30개 이상 always free)
- <https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/> (2025-07 개편 발표)
- 서울 단가: <https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/s3/USD/current/s3.json>, <https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/datatransfer/USD/current/datatransfer.json>

### 불확실한 부분

- **팀원 개인 계정이 2025-07-15 이전에 만든 것인지 이후인지에 따라 위 두 제도가 갈린다. 이건 사람에게 물어야 확인된다.** 이후 계정이면 "6개월 뒤 계정 자동 폐쇄"가 프로젝트 기간(4주)보다는 길지만 **서비스 존속에는 치명적**이며, Paid 플랜으로 올리면 결제 수단이 실제로 청구된다.
- "Always free 30+ 서비스" 목록에 S3·CloudFront가 각각 어떤 한도로 들어 있는지는 AWS 프리티어 페이지가 JS 렌더링이라 1차 출처로 뽑지 못했다 — **확인 불가**. Billing 콘솔에서 계정별로 확인해야 한다.

---

## 5. 크로스 계정 구성 (교육기관 EC2 → 개인 계정 S3)에서 필요한 권한 설정

### 사실

AWS 문서상 방식은 두 갈래이고, 둘 다 쓸 수 있다.

**방식 A — 리소스 기반 정책(버킷 정책)으로 직접 허용**

- 개인 계정(버킷 소유자, Account A)이 버킷 정책의 `Principal`에 교육기관 계정(Account B) 또는 그 안의 특정 IAM 역할 ARN을 적는다.
- **중요: 크로스 계정은 양쪽이 다 필요하다.** AWS 원문: *"the user will still need permission from the parent account, Account B… As long as the user has permission from both the resource owner and the parent account, the user will be able to access the resource."*
  - Account A: 버킷 정책에 `Principal: {"AWS": "arn:aws:iam::<B계정>:role/<EC2역할>"}` + `Action: s3:GetObject` 등
  - Account B: EC2 인스턴스 프로파일 역할의 IAM 정책에도 같은 버킷에 대한 `s3:GetObject` 허용
- 명시적 `Deny`는 어느 쪽에 있든 항상 이긴다.
- AWS는 개별 IAM 사용자보다 **역할에 권한을 주는 쪽을 권장**한다.

**방식 B — `sts:AssumeRole`로 개인 계정의 역할을 빌려 쓰기**

- 개인 계정(A)에 역할을 만들고, 그 역할의 **신뢰 정책(trust policy)** `Principal`에 교육기관 계정(B)을 적는다. 역할의 권한 정책에는 버킷 접근을 준다.
- 교육기관 계정(B)의 EC2 역할에 `sts:AssumeRole`(대상 역할 ARN 한정)을 허용한다.
- EC2 위의 앱이 `AssumeRole`을 호출해 **임시 자격 증명**을 받아 S3에 접근한다. 역할 세션 기본 1시간.
- 제3자 계정 시나리오에는 `ExternalId` 사용을 권장한다(같은 소유자 계정 간에는 불필요).

**비용 측면의 사실 (4번에서 인용)**

- **S3 → 같은 리전의 다른 AWS 서비스는 계정이 달라도 전송비 0.** 개인 계정 S3를 `ap-northeast-2`에 만들고 교육기관 EC2도 `ap-northeast-2`면, 개인 계정에서 EC2로 흘러가는 트래픽에는 전송 요금이 붙지 않는다(요청 요금은 붙는다).
- 그 다음 **EC2 → 사용자 인터넷** 구간은 교육기관 계정에 청구된다.

### 출처

- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/example-walkthroughs-managing-access-example2.html> (버킷 정책 크로스 계정 위임, "양쪽 다 필요" 원문)
- <https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_aws-accounts.html> (AssumeRole 시나리오, 신뢰 정책, 임시 자격 증명)
- <https://aws.amazon.com/s3/pricing/> (같은 리전 크로스 계정 전송 무료)

### 불확실한 부분

- **⚠ 이 절의 방식 A·B는 성립하지 않는다**(2026-07-27 실측, §8). 이 절은 "EC2 인스턴스 프로파일 역할"을 전제로 쓰였는데, 실제 인스턴스는 EC2가 아니라 Lightsail이고 **붙어 있는 `AmazonLightsailInstanceRole`에는 identity-based 정책이 아예 없다**(`aws lightsail get-instances` → AccessDenied, *"no identity-based policy allows"*). 그 역할을 고치려면 교육기관 계정(`<AWS_ACCOUNT_ID>`)의 IAM 권한이 필요한데 우리에겐 없다. AWS 문서도 *"Lightsail does not support service roles"*라고 적는다.
  이건 추정이 아니라 이 절이 인용한 AWS 규칙에서 바로 따라 나온다 — 크로스 계정은 **양쪽 다** 필요한데
  한쪽(교육기관 역할)을 우리가 못 고치므로, 개인 계정 버킷 정책에 역할 ARN을 아무리 정확히 적어도 통하지 않는다.
  - **남는 길 하나: 개인 계정의 IAM 사용자 액세스 키를 인스턴스에 심는다.** 이때 주체가 개인 계정 IAM 사용자가
    되므로 교육기관 계정 IAM이 관여하지 않는다(동일 계정 접근이 된다). **사실상 유일하게 우리 손으로 되는 길이다.**
    대가는 장기 자격 증명이라 시크릿 규칙과 충돌한다는 것 — 사람이 판단할 지점.
  - 남는 길 둘: 교육기관에 역할 정책 추가를 요청한다. 교육 환경이라 받아들여질지 미지수.
  - ~~Lightsail 자체 Object Storage로 크로스 계정을 없앤다~~ → **성립하지 않는다.** 그 스토리지는 교육기관
    계정 안에 만들어야 하는데 우리에게 그 계정 권한이 없다(선택지 표 G행).
  - 참고: 액세스 키 방식이면 인증이 키로 이뤄지므로 **버킷의 `aws:SourceIp` 잠금은 선택 사항이 된다.**
    IP 잠금을 빼면 §8의 static IP 미확정에 버킷 정책이 묶이지 않는다 — 131에서 같이 저울질할 것.
- 보안 그룹도 EC2의 것이 아니라 **Lightsail 자체 방화벽**이다. 편집 권한 여부는 콘솔 접근과 함께 미확인.
- ~~리전 확인 불가~~ → **`ap-northeast-2a` 확정**(§8). 개인 계정 S3를 같은 리전에 만들면 크로스 계정 전송 무료가 성립한다.

---

## 6. S3 presigned URL 업로드의 크기 제한·CORS 요구사항

### 사실 — 크기

- **단일 PUT: 최대 5GB.** AWS 원문: *"With a single `PUT` operation, you can upload a single object up to 5 GB in size."*
- 멀티파트 업로드: 5MB ~ 50TB. 5TB 초과는 Transfer Manager 사용.
- S3 콘솔 업로드는 최대 160GB(무관하지만 참고).
- **원본 GLB 20~30MB는 단일 PUT presigned URL로 충분하다.** 멀티파트 불필요.

### 사실 — 유효 기간

- 만료는 **URL 생성 시 지정한 시간**과 **서명에 쓴 자격 증명의 수명** 중 **먼저 오는 쪽**이다.
- IAM 사용자 장기 자격 증명(SigV4): 최대 **7일**.
- IAM 역할 자격 증명: **역할 세션이 끝나면 URL도 만료**된다. 지정한 만료 시각이 더 뒤여도 무효.
- **EC2 인스턴스 프로파일 자격 증명: 약 6시간이 상한.** ← Spring Boot가 EC2 역할로 서명하면 여기에 묶인다.
- STS AssumeRole 기본 세션 1시간.
- 콘솔에서 만들면 1분~12시간.
- 다운로드 중 만료돼도 이미 시작한 전송은 끝난다. 끊겨서 재시작하면 실패.
- presigned URL은 **베어러 토큰**이다. 가진 사람이면 누구나 쓴다. AWS는 `s3:signatureAge` 조건이나 네트워크 경로 제한으로 좁히라고 안내한다.

### 사실 — CORS

- **브라우저에서 presigned URL로 PUT 하려면 버킷에 CORS 설정이 반드시 필요하다.** 없으면 프리플라이트(OPTIONS)에서 막힌다.
- S3의 CORS 매칭 조건(원문 기준 3가지 전부 만족해야 함):
  - 요청의 `Origin` 헤더가 `AllowedOrigins`와 일치
  - `Access-Control-Request-Method`가 `AllowedMethods`에 있음
  - `Access-Control-Request-Headers`의 헤더가 전부 `AllowedHeaders`에 있음
- `AllowedMethods`에 쓸 수 있는 값: GET, PUT, POST, DELETE, HEAD
- `AllowedOrigins`: 와일드카드 `*`는 문자열당 하나만. `*` 단독도 가능.
- `AllowedHeaders`: 문자열당 와일드카드 하나. `x-amz-*` 같은 형태 가능.
- `ExposeHeaders`: JS가 읽을 수 있게 노출할 응답 헤더 (`x-amz-request-id` 등).
- `MaxAgeSeconds`: 프리플라이트 캐시 시간.
- 규칙은 버킷당 **최대 100개**. S3 콘솔에서는 **JSON만** 지원.
- AWS 예시(그대로 인용):

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["PUT", "POST", "DELETE"],
        "AllowedOrigins": ["http://www.example.com"],
        "ExposeHeaders": [
            "x-amz-server-side-encryption",
            "x-amz-request-id",
            "x-amz-id-2"
        ],
        "MaxAgeSeconds": 3000
    }
]
```

- **CORS를 켜도 버킷 정책·ACL은 그대로 적용된다.** AWS 원문: *"The ACLs and policies continue to apply when you enable CORS on your bucket."* → 1번 항목의 IP 잠금이 걸려 있으면 CORS를 아무리 열어도 브라우저 업로드는 여전히 403이다.
- 업로드 시 `Content-Type`을 URL 생성 때와 **똑같이** 보내야 한다. 다르면 `SignatureDoesNotMatch`.

### 출처

- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.html> (5GB 단일 PUT, 멀티파트 5MB~50TB)
- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html> (누가 만들 수 있나, 만료 규칙, EC2 인스턴스 프로파일 6시간, `s3:signatureAge`)
- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html> (PUT presigned URL 생성·사용, Content-Type 주의)
- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html> (CORS 평가 규칙, "ACL·정책은 계속 적용됨")
- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html> (CORS 요소 정의, 100 규칙 상한, 예시)

### 불확실한 부분

- **브라우저 업로드 대상 버킷을 1번의 IP 잠금 버킷과 같은 버킷으로 둘 수 없다**는 것이 위 사실에서 따라 나오는데, 그럼 "업로드용 공개 버킷 + 배포용 비공개 버킷" 2개 구성이 되는지, 아니면 프리픽스로 가르는지는 설계 결정이지 조사 대상이 아니다 → 131·136 티켓 소관.
- CloudFront OAC를 통한 PUT(2번 항목의 read-write 버킷 정책)로 업로드하는 경로는 문서상 가능하지만, presigned URL과 어떻게 결합하는지는 이 조사에서 검증하지 않았다 — **미검증**.

---

## 7. EC2의 nginx로 S3를 리버스 프록시 + 캐싱할 때의 트레이드오프

### 사실 — nginx 쪽 (1차 출처: nginx 공식 문서)

- `proxy_cache_path`에 **필수는 `keys_zone=이름:크기`** 하나뿐이고, `levels`·`max_size`·`inactive`·`min_free`·`use_temp_path`는 선택이다.
- `keys_zone` 크기: **1MB당 약 8,000개 키.** 에셋 수백 개 규모면 1MB로도 남는다.
- `inactive` 기본 **10분** — 10분간 요청 없는 항목은 지워진다. 에셋 캐시로 쓰려면 반드시 늘려야 한다.
- `max_size` 도달 시 **cache manager가 LRU로 제거**한다. 1회 반복당 기본 100개 삭제, 200ms 제한, 50ms 휴식.
- `proxy_cache_valid 200 <시간>`으로 응답 코드별 TTL 지정.
- `proxy_cache_key` 기본값 `$scheme$proxy_host$request_uri`.
- `proxy_cache_use_stale ... updating`으로 오리진 장애·갱신 중 stale 응답 서빙 가능.

### 사실 — 비용·대역폭 쪽

- **S3 → EC2 (같은 리전, 계정 달라도): 전송비 0.** 요청 요금($0.35/백만 GET)만 든다.
- **EC2 → 인터넷: 계정 합산 월 100GB 무료, 초과분 서울 리전 $0.126/GB** (첫 10TB 구간).
  - 이 100GB는 **S3 아웃바운드와 같은 100GB**다. 나눠 쓴다.
  - 이 요금은 **교육기관 계정에 청구**된다 — 우리 예산이 아니라 교육기관 예산을 쓴다는 뜻이고, 한도가 걸려 있는지는 확인 불가(8번 참조).
- 초기 로드 3MB 기준 단순 환산: 100GB ≈ **약 33,000회 초기 로드**. 그 뒤로는 3MB당 약 $0.00038.
- **디스크**: 압축 후 에셋이 100~500KB이고 전체 씬 예산 10MB이므로 전체 에셋 카탈로그가 수백 MB를 넘기 어렵다. EC2 루트 볼륨에 캐시를 두는 것이 용량 면에서 문제되기는 어렵다 — 다만 **EC2 디스크 크기를 모르므로 확정 불가**(8번).
- **대역폭·지연**: 모든 에셋이 단일 EC2의 NIC를 통과한다. CloudFront는 750개 이상 엣지에서 서빙한다(플랜 기능표). 동시 접속자가 늘면 EC2 아웃바운드가 병목이 되고, 이건 아키텍처 맵 §범위 밖("EC2 1대가 확정 제약")과 정면으로 만난다.
- **WAS와의 자원 경쟁**: 같은 인스턴스에서 Spring Boot도 돈다. 정적 파일 서빙이 CPU/메모리/네트워크를 나눠 쓴다.

### 출처

- <https://nginx.org/en/docs/http/ngx_http_proxy_module.html> (`proxy_cache_path`, `proxy_cache`, `proxy_cache_valid`, `proxy_cache_key`, `proxy_cache_use_stale`)
- <https://aws.amazon.com/s3/pricing/> (같은 리전 전송 무료, 100GB 인터넷 아웃바운드 무료 — 전 서비스 합산)
- 서울 EC2 아웃바운드 단가: <https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/datatransfer/USD/current/datatransfer.json> (`Asia Pacific (Seoul)` → `DataTransfer External Outbound Next 10 TB` = $0.126)
- <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html> (엣지 750개 이상)

### 불확실한 부분

- **EC2 인스턴스 타입·디스크·네트워크 대역폭을 모르므로 "언제 병목이 오는가"를 수치로 못 낸다** — 8번과 같은 원인.
- 교육기관 계정에 아웃바운드 100GB 초과분이 실제로 청구되는지, 아니면 교육기관가 차단/제한하는지 **확인 불가**.
- nginx가 S3에 붙을 때 요청 서명이 필요한지(비공개 버킷이면 SigV4 서명이 필요하고 nginx 단독으로는 어렵다 — `ngx_aws_auth` 같은 서드파티 모듈이나 사이드카가 필요) 여부는 이번에 1차 출처로 확인하지 않았다 — **미검증**. 1번 방식(IP 허용 + 익명 GET)이면 서명 없이 되지만, 그건 "IP만 맞으면 익명 GET 허용"이라는 정책을 쓴다는 뜻이다.

---

## 8. 교육기관이 제공하는 인스턴스 스펙

> **2026-07-27 갱신 (DERO-137).** 인스턴스에 직접 접속해 확인했다. 이 절이 "확인 불가"였을 때
> 세워진 다른 절의 숫자(§5 리전 전제, 선택지 표의 아웃바운드 한도)도 함께 고쳤다.

### 확인된 사실

**EC2가 아니라 AWS Lightsail이다.** 인스턴스 메타데이터의 IAM 역할이 `AmazonLightsailInstanceRole`로
나온다. 이전 판에서 "사실로 취급하지 말 것"이라고 적었던 Lightsail 설이 사실로 확인됐다.

| 항목 | 값 | 확인 방법 |
|---|---|---|
| 인스턴스 타입 | `t2.xlarge` — 4 vCPU / 16 GB | IMDSv2 메타데이터 |
| 루트 볼륨 | 320 GB SSD (309 GB 인식, 사용 6.5 GB) | `df -h /` |
| Docker 데이터 | 루트 볼륨과 같은 파일시스템(`/dev/root`) | `df -h /var/lib/docker` |
| 리전·AZ | **`ap-northeast-2a` (서울)** | IMDSv2 메타데이터 |
| 공인 IP | `203.0.113.10` | IMDSv2 메타데이터 |
| 인스턴스 역할 | `AmazonLightsailInstanceRole` — **identity-based 정책 없음** | 아래 AccessDenied |
| 교육기관 AWS 계정 | `<AWS_ACCOUNT_ID>` (인스턴스 `<INSTANCE_ID>`) | AccessDenied 메시지의 ARN |
| **월 데이터 전송** | **6 TB 포함** (Lightsail $84 플랜). 초과분만 GB당 $0.09~ | Lightsail 요금 페이지 |
| swap | 없음 (0 B) | `free -h` |

**IMDSv1은 차단돼 있다.** 토큰 없이 `169.254.169.254`를 치면 401이 온다. 메타데이터를 읽으려면
`PUT /latest/api/token`으로 토큰을 먼저 받아야 한다.

### 이 사실이 뒤집는 것

1. **아웃바운드가 100 GB가 아니라 6 TB다.** 선택지 표의 A·B·F행은 EC2 프리티어 100 GB 기준으로
   쓰였는데, Lightsail은 플랜에 전송량이 포함된다. 에셋을 전량 인스턴스로 프록시해도 한도에 닿기
   어렵다 — 9 MB짜리 페이지 로드 기준 약 66만 회분이다. **A·B·F안의 최대 약점이었던 대역폭
   병목이 비용 측면에서는 사라졌다**(단일 인스턴스의 처리량 병목은 그대로다).
2. **리전이 서울로 확정됐다.** §5의 "같은 리전 크로스 계정 전송 무료" 전제가 성립한다 — 개인 계정
   S3도 `ap-northeast-2`에 만들 때에 한해서다.
3. **인스턴스 역할로 AWS 리소스에 접근하는 길이 막혔다.** 인스턴스에서 `aws lightsail get-instances`를
   실행하면 AccessDenied가 나고, 메시지가 *"no identity-based policy allows"*라고 적는다 — 역할에
   권한 정책이 아예 붙어 있지 않다. 그 역할을 고치려면 교육기관 계정의 IAM 권한이 필요한데 우리에겐
   없다. **§5의 방식 A·B(인스턴스 역할에 크로스 계정 S3 권한 부여)가 사실상 성립하지 않는다.**
4. **디스크는 제약이 아니다.** 303 GB가 비어 있다. CI가 쌓는 이미지도, 에셋을 디스크에 두는 F안도
   용량 때문에 막히지 않는다.
5. **Lightsail 네이티브 조합이 선택지에 없다.** 아래 "아직 확인 못 한 것" 참조.

### 아직 확인 못 한 것

| 항목 | 왜 못 했나 | 어떻게 확인하나 |
|---|---|---|
| **static IP 부착 여부** | Lightsail 콘솔 자격증명이 없고, 인스턴스에 AWS CLI가 없다 | 콘솔 Networking 탭에서 공인 IP 옆 파란 압정 확인, 또는 `aws lightsail get-instances`의 `isStaticIp`. **교육기관 요청 대기 중** |
| 6 TB 초과분 과금 주체 | 교육기관 계약 조건 | 교육기관 담당자 문의. 넘길 가능성은 낮다 |
| ~~Lightsail 관리 API 권한 범위~~ | **해결** — AccessDenied. 역할에 정책이 없다 | — |
| ~~역할에 S3 권한이 있는지~~ | **칠 필요 없다** — 크로스 계정은 양쪽 정책이 다 있어야 하는데(§5 인용 AWS 원문) 교육기관 쪽 역할에 정책이 없고 고칠 수도 없다. 결과가 무엇이든 이 경로는 막혀 있다 | — |

**static IP는 지금 급한 불은 아니다** — 공인 IP는 인스턴스를 **정지·재시작할 때만** 바뀐다. 다만
바뀌면 Jenkins URL·GitLab webhook·배포 설정이 한꺼번에 깨지므로 인스턴스를 세우기 전에 정리해야
한다. Lightsail static IP는 **인스턴스에 붙어 있는 동안 무료**다(떼어놓으면 과금).

### 출처

- 인스턴스에서 직접 실행 (2026-07-27): IMDSv2 메타데이터, `nproc`, `free -h`, `df -h`
- <https://aws.amazon.com/lightsail/pricing/> — 4 vCPU/16 GB/320 GB SSD = 월 $84, 데이터 전송 6 TB 포함. *"Only outbound data transfer in excess of your plan's data transfer allowance is subject to overage charges."*
- <https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-static-ip-addresses-in-amazon-lightsail.html> — *"If you haven't set up a static IP address, each time you stop or restart your instance, Lightsail assigns a new public IP address."*
- <https://docs.aws.amazon.com/lightsail/latest/userguide/security_iam_service-with-iam.html> — *"Lightsail does not support service roles."*

---

## 선택지와 각각의 대가

에셋을 브라우저에 도달시키는 경로별 정리. 순위·추천 없음.

| 선택지 | 브라우저 직배신 | 월 무료 한도 | 돈이 나가는 곳 | 새로 감당할 것 | 아직 확인 못 한 것 |
|---|---|---|---|---|---|
| **A. S3 IP 잠금 + 인스턴스 프록시** (원래 계획) | 불가 — 전량 인스턴스 경유 | **Lightsail 플랜 포함 6TB**(§8) | 6TB 초과분만 **교육기관 계정** $0.09/GB~ | nginx 캐시 설정, 단일 인스턴스 처리량 병목, 비공개 버킷이면 SigV4 서명 수단 | nginx→비공개 S3 서명 방법(§7), 인스턴스에 IAM 역할을 붙일 수 있는지(§5·§8) |
| **B. S3 IP 잠금 + 인스턴스 프록시 + nginx 캐시** | 불가 | 동일 | 동일. 단 S3 GET 요청 수는 캐시로 감소 | A + 캐시 무효화 운영, 디스크 사용량(303GB 여유 확인됨) | A와 동일 |
| **C. CloudFront(OAC) + 비공개 S3, 종량제** | 가능 | **1TB 전송 + 10M 요청** (기간 제한 없음, 초과 시 과금) | 초과분 **개인 계정** Asia $0.120/GB | CloudFront 배포 관리, `CORS-S3Origin` 정책, 캐시 무효화, 결제 수단 노출 | 신규 계정에도 1TB가 적용되는지(§3), 커스텀 도메인 필요 여부(§2) |
| **D. CloudFront(OAC) + 비공개 S3, 정액 Free 플랜** | 가능 | **100GB 전송 + 1M 요청** (초과해도 **과금 없음**, 성능 조정 가능) | 원칙적으로 $0. 초과 시 돈 대신 성능이 깎임 | C와 동일 + 플랜=배포 1개 제약, 초과 시 성능 예측 불가 | "성능 조정"의 실제 정도(§3), 계정 프리티어 상태(§4) |
| **E. S3 버킷을 공개(익명 GET)로 열기** | 가능 | S3 아웃바운드 100GB(전 서비스 합산) | 초과분 **개인 계정** 서울 $0.126/GB | Block Public Access 해제, 버킷 CORS, 무제한 다운로드 노출(비용 폭주 위험) | 팀·교육기관의 공개 버킷 허용 여부 |
| **F. 에셋을 인스턴스 디스크에 직접 두기(S3 미사용)** | 불가 | **Lightsail 플랜 포함 6TB**(§8) | 6TB 초과분만 **교육기관 계정** $0.09/GB~ | 배포마다 에셋 동기화, 사용자 업로드분 저장 위치 | 없음 — 디스크 303GB 여유·리전·전송량 모두 §8에서 확정 |
| **G. Lightsail 네이티브 (Object Storage + CDN)** | 가능(추정) | 미확인 | 미확인 | **교육기관 계정 안에 만들어야 하는데 우리에게 그 계정 권한이 없다** | 사실상 교육기관가 대신 만들어주지 않으면 성립하지 않는다. 처음엔 "같은 계정이라 크로스 계정 문제가 사라진다"고 봤으나, 그 계정에 우리가 접근을 못 한다는 점에서 뒤집혔다(2026-07-27) |

**업로드 경로(REQ-COM-09)는 위와 별개 축이다:**

| 업로드 선택지 | 성립 조건 | 대가 |
|---|---|---|
| presigned URL로 브라우저 → S3 직접 PUT | 대상 버킷이 **IP 잠금이 아니어야** 함(§6). 버킷 CORS 필요 | 버킷을 2개로 가르거나 정책을 프리픽스로 갈라야 함. URL 유효기간이 EC2 역할 자격 증명(약 6시간)에 묶임 |
| 브라우저 → WAS(EC2) → S3 | 추가 조건 없음 | 20~30MB 원본이 EC2 메모리/디스크와 인바운드를 통과. WAS 업로드 제한·타임아웃 조정 필요 |
| CloudFront(OAC, read-write) 경유 PUT | OAC는 PUT/DELETE 지원(§2) | 문서상 가능하나 presigned URL과의 결합 **미검증** |

---

## 확인 불가 / 미검증 목록 (한 곳에 모음)

| # | 내용 | 왜 못 했나 | 어떻게 확인하나 |
|---|---|---|---|
| ~~1~~ | ~~교육기관 제공 EC2 스펙·리전·디스크·아웃바운드 정책~~ | **해결 (2026-07-27, DERO-137)** — Lightsail `t2.xlarge`·서울·320GB·6TB/월. §8 참조 | — |
| 1a | Lightsail static IP 부착 여부 | 콘솔 자격증명 없음. AWS CLI는 깔았으나 `lightsail:GetInstances`가 AccessDenied | 교육기관 담당자에게 확인·부착 요청 (부착 중엔 무료) |
| ~~1b~~ | ~~인스턴스에 커스텀 IAM 역할을 붙일 수 있는지~~ | **해결 (2026-07-27)** — 역할에 정책이 없고 우리가 고칠 권한도 없다. §5·§8 참조 | — |
| ~~1c~~ | ~~Lightsail Object Storage(선택지 G)의 한도·요금·CORS~~ | **조사 불필요 (2026-07-27)** — 교육기관 계정 안에서만 만들 수 있는데 그 권한이 없다 | 교육기관가 대신 만들어줄 의사가 있을 때만 다시 검토 |
| ~~1d~~ | ~~인스턴스 역할에 S3 권한이 있는지~~ | **확인 불필요 (2026-07-27)** — 크로스 계정은 양쪽 정책이 다 있어야 하는데 교육기관 쪽이 비어 있다. 결과와 무관하게 경로가 막힌다 | — |
| 2 | 팀원 개인 AWS 계정의 생성 시점(2025-07-15 전/후) | 사람에게 물어야 함 | 계정 소유자에게 확인 |
| 3 | CloudFront 종량제 프리티어(1TB/10M)가 신규 계정에도 적용되는지 | AWS 프리티어 서비스 목록이 JS 렌더링이라 스크래이핑 실패. FAQ 문구는 2021년 것 | 계정 생성 후 Billing 콘솔 → 프리티어 사용량 |
| 4 | "Always free 30+" 목록의 S3·CloudFront 항목별 한도 | 위와 같은 이유 | 위와 같음 |
| 5 | 정액 Free 플랜 초과 시 "성능 조정"의 실제 정도 | AWS가 수치로 공개하지 않음 | 공개 자료 없음 — 실측 외 방법 없음 |
| 6 | nginx가 비공개 S3에 SigV4 서명해 붙는 방법 | 이번 조사 범위에서 1차 출처 미확인 | nginx 서드파티 모듈 / 사이드카 프록시 조사 필요 |
| 7 | CloudFront OAC PUT + presigned URL 결합 | 문서상 가능하다는 것만 확인, 절차 미확인 | AWS 문서 추가 조사 또는 실험 |
| 8 | CloudFront 커스텀 도메인 필요 여부 및 ACM(us-east-1) 절차 | 설계 결정 대기 중이라 조사 안 함 | 131 세션에서 도메인 방침 정한 뒤 |
