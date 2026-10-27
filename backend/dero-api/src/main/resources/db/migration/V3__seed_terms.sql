-- V3 — 동의 항목 4종의 1회차 시딩. **스키마 변경이 아니라 데이터다** (erd.md 무변경).
--
-- 온보딩 완료는 파생값이라(api-spec.md §3) terms에 필수 항목 행이 하나도 없으면
-- onboardingRequired가 영원히 false다 — 온보딩 화면이 아예 안 뜬다. 그래서 이 4행이 기능의 전제다.
-- 항목을 늘리는 데는 배포가 필요 없다(행 INSERT 하나) — code를 Java enum으로 만들지 않은 이유다.
--
-- 개정은 이 행을 고치는 게 아니라 revision + 1 행을 새로 넣는 것이다(erd.md terms 절).
-- content_key는 약관 본문 object key인데 아직 올린 문서가 없어 NULL이다.
-- effective_at은 과거 시각이다 — 미래로 두면 "현행 회차"에 안 잡혀 동의를 받을 수 없다.
-- ON CONFLICT는 uq_terms_code_revision과 짝이다: 이미 손으로 넣어 둔 환경에서도 안전하게 지나간다.

INSERT INTO terms (code, revision, title, content_key, is_required, effective_at)
VALUES ('TERMS_OF_SERVICE', 1, '서비스 이용약관', NULL, true, '2026-08-01T00:00:00+09:00'),
       ('PRIVACY_POLICY', 1, '개인정보 수집·이용 동의', NULL, true, '2026-08-01T00:00:00+09:00'),
       ('AGE_OVER_14', 1, '만 14세 이상입니다', NULL, true, '2026-08-01T00:00:00+09:00'),
       ('MARKETING', 1, '마케팅 정보 수신 동의 (선택)', NULL, false, '2026-08-01T00:00:00+09:00')
ON CONFLICT (code, revision) DO NOTHING;
