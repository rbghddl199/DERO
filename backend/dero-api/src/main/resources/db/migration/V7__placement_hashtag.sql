-- V7 — placement_hashtag 정션 신설.
-- docs/context/erd.md(스키마 정본)에서 파생한다 — 이 테이블은 2026-08-07에 프리즈를 열어 승인됐고
-- (개정표 "`placement_hashtag` 정션 신설 (2026-08-07, 승인 박동규, ADR-0027, DERO-488)")
-- 정본 표에도 실려 있다. 문서가 앞서 간 상태를 DDL이 따라잡는 것이다.
-- erd.md는 손대지 않는다(동결 — docs/HARNESS-RULES.md §4).
--
-- 데스크 피드의 태그 칩이 값 없이 비어 있는 것을 닫는다(REQ-COM-13). placement에는 태그 컬럼이
-- 없어 지금 그 칩은 영구히 빈 상태다.
--
-- placement에 태그 문자열 컬럼(배열·CSV)을 두는 안은 부결됐다(ADR-0027 결정 5) — 태그 마스터가
-- 두 벌이면 #원목데스크가 피드와 커뮤니티에서 다른 태그가 된다. hashtag 마스터는
-- product_hashtag·post_hashtag와 공유하고 붙는 대상만 정션으로 가른다. 구조는 post_hashtag와
-- 글자 그대로 대칭이다.
--
-- 감사 2종이고 updated_at은 영원히 NULL이다 — 정션 행은 생성 후 변하지 않고 hard delete된다
-- (erd.md 전역 규칙의 명시적 예외).
--
-- hard delete 테이블이라 deleted_at이 없다: soft delete와 UNIQUE는 충돌해서, 태그를 뗀 행을
-- 남겨두면 같은 태그 재부착이 uq_placement_hashtag_placement_id_hashtag_id에 막힌다.
--
-- FK 2개가 전부 ON DELETE CASCADE다 — 참조 컬럼이 NOT NULL이라 SET NULL을 쓸 수 없고, NO ACTION
-- 이면 부모의 물리 삭제 자체가 거부되어 hard delete 정의와 어긋난다(erd.md 삭제 정책 절).
--
-- 테이블 추가라 ADR-0026의 확장/축소 규칙에서 확장 쪽이고 배포 1회로 나간다 — 기존 코드는 이
-- 테이블을 읽지도 쓰지도 않으므로 구/신 버전이 같이 떠 있어도 안전하다.
CREATE SEQUENCE placement_hashtag_id_seq INCREMENT BY 50;

CREATE TABLE placement_hashtag (
    id           BIGINT      NOT NULL DEFAULT nextval('placement_hashtag_id_seq'),
    placement_id BIGINT      NOT NULL,
    hashtag_id   BIGINT      NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   BIGINT,
    updated_at   TIMESTAMPTZ,
    updated_by   BIGINT,
    CONSTRAINT pk_placement_hashtag PRIMARY KEY (id),
    CONSTRAINT uq_placement_hashtag_placement_id_hashtag_id UNIQUE (placement_id, hashtag_id)
);

ALTER SEQUENCE placement_hashtag_id_seq OWNED BY placement_hashtag.id;

ALTER TABLE placement_hashtag
    ADD CONSTRAINT fk_placement_hashtag_placement FOREIGN KEY (placement_id) REFERENCES placement (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_placement_hashtag_hashtag FOREIGN KEY (hashtag_id) REFERENCES hashtag (id) ON DELETE CASCADE;

-- 복합 UNIQUE의 선두 컬럼(placement_id)은 그 유니크 인덱스가 이미 커버한다 — erd.md 전역 규칙의
-- 명시적 예외라 단독 인덱스를 만들지 않는다.
CREATE INDEX idx_placement_hashtag_hashtag_id ON placement_hashtag (hashtag_id);
