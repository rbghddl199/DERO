-- V15 — 사진별 제품 태그 정션 (DERO-621).
-- docs/context/erd.md(스키마 정본)에서 파생한다 — 결정은 D37 개정·ADR-0040이다.
--
-- **백필이 없다.** 같은 요구를 하루 전 ADR-0039가 본문 토큰 `[[products:…]]`으로 풀어 머지까지
-- 갔지만 **운영 배포 전**이라 본문에 토큰이 0건이다. 그래서 이 파일은 테이블만 만든다 —
-- 나중에 배포된 뒤였다면 본문을 파싱해 정션에 옮기고 토큰을 떼는 변환이 여기 붙었을 것이다.
--
-- 글 단위 desk_feed_product(≤10)는 그대로 두고, 이 표는 그 부분집합이다(WAS가 강제한다).
-- 기존 테이블·컬럼은 무변경 — 확장 쪽 마이그레이션이라 배포 1회다(ADR-0026).

CREATE SEQUENCE desk_feed_image_product_id_seq INCREMENT BY 50;

-- desk_feed_image N:M product 정션. 감사 2종(updated_at은 영원히 NULL). hard delete —
-- 태그를 뗀 행을 남겨두면 같은 제품 재부착이 UNIQUE에 막힌다(desk_feed_product와 같은 판단).
CREATE TABLE desk_feed_image_product (
    id                 BIGINT      NOT NULL DEFAULT nextval('desk_feed_image_product_id_seq'),
    desk_feed_image_id BIGINT      NOT NULL,
    product_id         BIGINT      NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by         BIGINT,
    updated_at         TIMESTAMPTZ,
    updated_by         BIGINT,
    CONSTRAINT pk_desk_feed_image_product PRIMARY KEY (id),
    CONSTRAINT uq_desk_feed_image_product_image_id_product_id UNIQUE (desk_feed_image_id, product_id)
);

ALTER SEQUENCE desk_feed_image_product_id_seq OWNED BY desk_feed_image_product.id;

-- 사진이 지워지면 태그도 함께 사라져야 한다 — 본문 토큰 시절 앱 코드가 매번 지켜야 했던 정합이
-- 여기서는 DB 제약이다(ADR-0040 맥락).
ALTER TABLE desk_feed_image_product
    ADD CONSTRAINT fk_desk_feed_image_product_desk_feed_image FOREIGN KEY (desk_feed_image_id) REFERENCES desk_feed_image (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_desk_feed_image_product_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE;

-- 복합 UNIQUE의 선두 컬럼(desk_feed_image_id)은 그 유니크 인덱스가 커버한다. product_id 쪽은
-- 역방향("이 제품이 찍힌 사진")용으로 필요하다 — Postgres는 FK에 인덱스를 자동으로 만들지 않는다.
CREATE INDEX idx_desk_feed_image_product_product_id ON desk_feed_image_product (product_id);
