-- V12 — 데스크피드를 post 동형 구조로 전환 + post 원본에서 재이관 (DERO-568).
-- docs/context/erd.md(스키마 정본)에서 파생한다 — desk_feed·desk_feed_image 개정은 D32 개정이고
-- 근거는 ADR-0034(예정)다. erd.md는 손대지 않는다(동결 — HARNESS-RULES §4).
--
-- V11의 "사진 우선(캡션만·제목 없음·display_order가 순서 정본)" 모델을 버리고 post와 동형으로
-- 맞춘다: title + 마크다운 본문(이미지 ![alt](key)가 본문 안 위치의 정본) + is_primary 표지 1장.
-- 순서 컬럼은 정본이 둘(본문 위치·순서 컬럼)이 되므로 없앤다(post_image와 같은 판단).
--
-- ADR-0026의 확장/축소 규칙에서 **축소**(컬럼·제약 삭제)라 배포 1회로 나가고, 같은 배포의 WAS만
-- 이 스키마를 읽는다. 기존 데스크피드 글은 전량 삭제 후 post 원본에서 다시 이관한다 —
-- 좋아요·댓글 리셋은 2026-08-11 박동규 승인.

-- =====================================================================
-- ① 기존 데스크피드 글 전량 삭제 — post 원본에서 재이관하므로 남겨 둘 이유가 없고, title이
--    NOT NULL이라 남기면 채울 값이 없다(0건이라 DEFAULT도 필요 없다).
--    자식 FK가 전부 ON DELETE CASCADE라 image·like·comment·hashtag가 동반 삭제된다.
-- =====================================================================

DELETE FROM desk_feed;

-- =====================================================================
-- ② 스키마 — title 추가 + 이미지 구조 교체(display_order → is_primary)
-- =====================================================================

ALTER TABLE desk_feed ADD COLUMN title VARCHAR(100) NOT NULL;

ALTER TABLE desk_feed_image
    DROP CONSTRAINT uq_desk_feed_image_desk_feed_id_display_order;
ALTER TABLE desk_feed_image DROP COLUMN display_order;
ALTER TABLE desk_feed_image ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT false;

-- "글당 표지 1장"은 부분 유니크가 DB에서 강제한다(uq_post_image_post_id와 같은 형태).
CREATE UNIQUE INDEX uq_desk_feed_image_desk_feed_id
    ON desk_feed_image (desk_feed_id) WHERE is_primary;
-- 복합 UNIQUE가 사라져 선두 컬럼을 커버하던 인덱스도 없어졌다 — FK 인덱스를 신설한다
-- (Postgres는 FK에 인덱스를 자동으로 만들지 않는다, erd.md 전역 규칙).
CREATE INDEX idx_desk_feed_image_desk_feed_id ON desk_feed_image (desk_feed_id);

-- =====================================================================
-- ③ post → desk_feed 재이관 — 운영에서 데스크피드로 쓰인 post 4건(502·552·553·554)을
--    새 구조로 옮긴다. post 동형이 된 덕에 V11의 캡션 조립(title을 본문 앞줄에 합치고 이미지
--    마크다운을 지우던 것)이 필요 없다 — title·본문을 그대로 복사한다.
--
--    · like_count = 0이고 desk_feed_like는 안 옮긴다(좋아요·댓글 리셋 승인 — 위 헤더).
--    · 감사 컬럼(created_at·created_by·updated_at·updated_by)은 원본을 보존한다(피드 정렬·
--      작성 주체 추적). deleted_at은 복사하지 않는다 — 원본 post는 V11이 이미 내렸고, 여기서
--      태어나는 desk_feed 행은 살아 있어야 한다.
--    · 해시태그는 옮기지 않는다 — 이관 범위가 title·본문·작성자·감사·사진이다.
--    · 이미지 key는 post-images/ 접두사를 그대로 참조한다. 오브젝트 정리 로직이 없어 파일이
--      남아 있고, 새 접두사로 복사하는 경로도 없다(ADR-0034). 그래서 이 글에 사진을 추가하면
--      desk-feed-images/ 접두사가 섞이는데, requireOwnKeys는 신규 등록만 보므로 문제되지 않는다.
--    · post 쪽 행이 없는 환경(로컬·테스트 빈 DB)에서는 0건 이관으로 조용히 지나간다.
--
--    desk_feed_id 매핑은 임시 컬럼 source_post_id로 잇는다 — INSERT ... SELECT는 채번된 id를
--    입력 행과 짝지어 주지 않으므로, DO 블록의 행 루프 없이 한 문장으로 옮기려면 이 자리가
--    필요하다. 이관이 끝나면 지운다.
-- =====================================================================

ALTER TABLE desk_feed ADD COLUMN source_post_id BIGINT;

INSERT INTO desk_feed (user_id, placement_id, title, content, like_count,
                       created_at, created_by, updated_at, updated_by, source_post_id)
SELECT p.user_id, NULL, p.title, p.content, 0,
       p.created_at, p.created_by, p.updated_at, p.updated_by, p.id
FROM post p
WHERE p.id IN (502, 552, 553, 554);

INSERT INTO desk_feed_image (desk_feed_id, image_key, is_primary, created_at, created_by)
SELECT df.id, pi.image_key, pi.is_primary, pi.created_at, pi.created_by
FROM desk_feed df
    JOIN post_image pi ON pi.post_id = df.source_post_id;

ALTER TABLE desk_feed DROP COLUMN source_post_id;

-- =====================================================================
-- ④ 사용된 제품 태그 정션 — "이 책상에 쓰인 제품"(ADR-0034 결정 5). 상세 하단 카드에서 내부
--    링크 /product/{id}로 이동한다(외부 쿠팡류 링크 아님).
--    토큰이 아니라 정션인 이유: 요구가 구조화된 목록이고 역방향("이 제품이 쓰인 데스크피드")이
--    인덱스 하나로 성립한다 — 화면은 후속이지만 인덱스는 지금 만든다.
--    상한 10개는 행 개수 조건이라 WAS가 강제한다(사진 상한과 같은 결).
--    재이관 4건에는 제품 태그가 없다 — post 원본에 해당 개념이 없다.
-- =====================================================================

CREATE SEQUENCE desk_feed_product_id_seq INCREMENT BY 50;

-- desk_feed N:M product 정션. 감사 2종(updated_at은 영원히 NULL). hard delete — 태그를 뗀 행을
-- 남겨두면 같은 제품 재부착이 UNIQUE에 막힌다(desk_feed_hashtag와 같은 판단).
CREATE TABLE desk_feed_product (
    id           BIGINT      NOT NULL DEFAULT nextval('desk_feed_product_id_seq'),
    desk_feed_id BIGINT      NOT NULL,
    product_id   BIGINT      NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   BIGINT,
    updated_at   TIMESTAMPTZ,
    updated_by   BIGINT,
    CONSTRAINT pk_desk_feed_product PRIMARY KEY (id),
    CONSTRAINT uq_desk_feed_product_desk_feed_id_product_id UNIQUE (desk_feed_id, product_id)
);

ALTER SEQUENCE desk_feed_product_id_seq OWNED BY desk_feed_product.id;

ALTER TABLE desk_feed_product
    ADD CONSTRAINT fk_desk_feed_product_desk_feed FOREIGN KEY (desk_feed_id) REFERENCES desk_feed (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_desk_feed_product_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE;

-- 복합 UNIQUE의 선두 컬럼(desk_feed_id)은 그 유니크 인덱스가 커버하므로 단독 인덱스를 만들지
-- 않는다. product_id 쪽은 역방향 조회용으로 필요하다(erd.md 전역 규칙 — Postgres는 FK에
-- 인덱스를 자동으로 만들지 않는다).
CREATE INDEX idx_desk_feed_product_product_id ON desk_feed_product (product_id);
