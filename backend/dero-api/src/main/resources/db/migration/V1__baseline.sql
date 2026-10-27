-- V1 baseline — docs/context/erd.md(스키마 정본)에서 파생. 37테이블.
--
-- 전역 규칙 (erd.md "전역 규칙")
--   * PK: 테이블별 명시 시퀀스 — CREATE SEQUENCE <테이블>_id_seq INCREMENT BY 50
--          + id BIGINT NOT NULL DEFAULT nextval('<테이블>_id_seq')
--     identity를 쓰지 않는 이유: identity가 만든 시퀀스는 information_schema.sequences에
--     나타나지 않아 Hibernate ddl-auto=validate가 missing sequence로 부팅을 죽인다.
--     INCREMENT BY 50은 JPA @SequenceGenerator(allocationSize = 50)과 짝이다(ADR-0006 결정 8).
--     둘이 어긋나면 PK가 조용히 충돌한다.
--   * 제약은 NOT NULL·FK·UNIQUE만 쓴다(값 검증은 WAS 소관). 열거값은 VARCHAR + UPPER_SNAKE 문자열이고
--     Postgres 열거 타입을 만들지 않는다 — 값 하나 추가에 마이그레이션이 필요해진다.
--   * 시각은 전부 TIMESTAMPTZ(UTC 저장). deleted_at에는 기본값을 두지 않는다.
--   * soft delete 테이블의 자연키 유니크는 부분 유니크 인덱스(WHERE deleted_at IS NULL).
--   * 모든 FK 컬럼에 인덱스. 예외는 복합 UNIQUE의 선두 컬럼.
--   * "user"는 SQL 예약어라 인용한다.
--   * 시딩 데이터는 Flyway 밖에 둔다(ADR-0006 결정 9).
--
-- 구성: ⓪ 시퀀스 30개 → ① CREATE TABLE 37개(PK·UNIQUE 인라인) + 시퀀스 소유권
--       → ② FK를 ALTER TABLE로 일괄 부착 → ③ 인덱스.


-- =====================================================================
-- ⓪ 시퀀스 — PK 30개. 나머지 7개(규격 서브타입 5종·asset·product_emitter)는 product_id가 PK라 없다.
-- =====================================================================

CREATE SEQUENCE user_id_seq INCREMENT BY 50;
CREATE SEQUENCE follow_id_seq INCREMENT BY 50;
CREATE SEQUENCE terms_id_seq INCREMENT BY 50;
CREATE SEQUENCE user_consent_id_seq INCREMENT BY 50;
CREATE SEQUENCE brand_id_seq INCREMENT BY 50;
CREATE SEQUENCE category_id_seq INCREMENT BY 50;
CREATE SEQUENCE product_id_seq INCREMENT BY 50;
CREATE SEQUENCE product_image_id_seq INCREMENT BY 50;
CREATE SEQUENCE desk_texture_id_seq INCREMENT BY 50;
CREATE SEQUENCE vesa_spec_id_seq INCREMENT BY 50;
CREATE SEQUENCE product_vesa_id_seq INCREMENT BY 50;
CREATE SEQUENCE vibe_id_seq INCREMENT BY 50;
CREATE SEQUENCE product_vibe_id_seq INCREMENT BY 50;
CREATE SEQUENCE hashtag_id_seq INCREMENT BY 50;
CREATE SEQUENCE product_hashtag_id_seq INCREMENT BY 50;
CREATE SEQUENCE placement_id_seq INCREMENT BY 50;
CREATE SEQUENCE placement_desk_id_seq INCREMENT BY 50;
CREATE SEQUENCE placed_item_id_seq INCREMENT BY 50;
CREATE SEQUENCE comment_id_seq INCREMENT BY 50;
CREATE SEQUENCE placement_like_id_seq INCREMENT BY 50;
CREATE SEQUENCE product_like_id_seq INCREMENT BY 50;
CREATE SEQUENCE placement_bookmark_group_id_seq INCREMENT BY 50;
CREATE SEQUENCE placement_bookmark_id_seq INCREMENT BY 50;
CREATE SEQUENCE post_id_seq INCREMENT BY 50;
CREATE SEQUENCE post_image_id_seq INCREMENT BY 50;
CREATE SEQUENCE post_like_id_seq INCREMENT BY 50;
CREATE SEQUENCE post_comment_id_seq INCREMENT BY 50;
CREATE SEQUENCE post_hashtag_id_seq INCREMENT BY 50;
CREATE SEQUENCE cart_item_id_seq INCREMENT BY 50;
CREATE SEQUENCE generated_image_id_seq INCREMENT BY 50;


-- =====================================================================
-- ① 테이블
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 사용자·소셜
-- ---------------------------------------------------------------------

-- 감사 3종
CREATE TABLE "user" (
    id                BIGINT        NOT NULL DEFAULT nextval('user_id_seq'),
    email             VARCHAR(320)  NOT NULL,
    provider          VARCHAR(10)   NOT NULL,
    provider_id       VARCHAR(255)  NOT NULL,
    nickname          VARCHAR(50)   NOT NULL,
    profile_image_key VARCHAR(1024),
    status            VARCHAR(10)   NOT NULL DEFAULT 'ACTIVE',
    role              VARCHAR(10)   NOT NULL DEFAULT 'USER',
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by        BIGINT,
    updated_at        TIMESTAMPTZ,
    updated_by        BIGINT,
    deleted_at        TIMESTAMPTZ,
    CONSTRAINT pk_user PRIMARY KEY (id)
);

-- 감사 2종(updated_at은 영원히 NULL). hard delete — 언팔로우는 행 삭제다.
CREATE TABLE follow (
    id           BIGINT      NOT NULL DEFAULT nextval('follow_id_seq'),
    follower_id  BIGINT      NOT NULL,
    following_id BIGINT      NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   BIGINT,
    updated_at   TIMESTAMPTZ,
    updated_by   BIGINT,
    CONSTRAINT pk_follow PRIMARY KEY (id),
    CONSTRAINT uq_follow_follower_id_following_id UNIQUE (follower_id, following_id)
);

-- 동의 항목·개정 회차 마스터. 감사 2종. soft delete 아님 — 법적 증빙이라 행을 지우지 않는다.
-- revision은 개정 회차다. version(낙관적 락 전용어)과 다르다.
CREATE TABLE terms (
    id           BIGINT        NOT NULL DEFAULT nextval('terms_id_seq'),
    code         VARCHAR(30)   NOT NULL,
    revision     INT           NOT NULL,
    title        VARCHAR(200)  NOT NULL,
    content_key  VARCHAR(1024),
    is_required  BOOLEAN       NOT NULL DEFAULT false,
    effective_at TIMESTAMPTZ   NOT NULL,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by   BIGINT,
    updated_at   TIMESTAMPTZ,
    updated_by   BIGINT,
    CONSTRAINT pk_terms PRIMARY KEY (id),
    CONSTRAINT uq_terms_code_revision UNIQUE (code, revision)
);

-- 동의 이력. 감사 2종(updated_at은 영원히 NULL). append-only — 철회·재동의도 새 행이고,
-- 동의 시각은 created_at이다. UNIQUE를 두지 않는다.
CREATE TABLE user_consent (
    id         BIGINT      NOT NULL DEFAULT nextval('user_consent_id_seq'),
    user_id    BIGINT      NOT NULL,
    terms_id   BIGINT      NOT NULL,
    is_agreed  BOOLEAN     NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by BIGINT,
    updated_at TIMESTAMPTZ,
    updated_by BIGINT,
    CONSTRAINT pk_user_consent PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------
-- 2. 카탈로그
-- ---------------------------------------------------------------------

-- 감사 3종
CREATE TABLE brand (
    id             BIGINT        NOT NULL DEFAULT nextval('brand_id_seq'),
    name           VARCHAR(100)  NOT NULL,
    description    TEXT,
    brand_url      VARCHAR(2048),
    logo_image_key VARCHAR(1024),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by     BIGINT,
    updated_at     TIMESTAMPTZ,
    updated_by     BIGINT,
    deleted_at     TIMESTAMPTZ,
    CONSTRAINT pk_brand PRIMARY KEY (id)
);

-- 감사 3종. name에 유니크를 걸지 않는다 — 부모가 다르면 같은 이름이 정당하다.
CREATE TABLE category (
    id            BIGINT       NOT NULL DEFAULT nextval('category_id_seq'),
    parent_id     BIGINT,
    name          VARCHAR(50)  NOT NULL,
    description   VARCHAR(255),
    display_order INT          NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by    BIGINT,
    updated_at    TIMESTAMPTZ,
    updated_by    BIGINT,
    deleted_at    TIMESTAMPTZ,
    CONSTRAINT pk_category PRIMARY KEY (id)
);

-- 감사 3종. source별 필수 여부(brand_id·price_krw·product_url)는 WAS가 강제한다.
-- 대표 이미지 컬럼을 두지 않는다 — product_image.is_primary가 정본이다(ADR-0011 결정 6).
CREATE TABLE product (
    id            BIGINT        NOT NULL DEFAULT nextval('product_id_seq'),
    source        VARCHAR(10)   NOT NULL DEFAULT 'CATALOG',
    owner_user_id BIGINT,
    brand_id      BIGINT,
    category_id   BIGINT        NOT NULL,
    spec_type     VARCHAR(20)   NOT NULL,
    name          VARCHAR(200)  NOT NULL,
    description   TEXT,
    price_krw     INT,
    product_url   VARCHAR(2048),
    status        VARCHAR(10)   NOT NULL DEFAULT 'ACTIVE',
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by    BIGINT,
    updated_at    TIMESTAMPTZ,
    updated_by    BIGINT,
    deleted_at    TIMESTAMPTZ,
    CONSTRAINT pk_product PRIMARY KEY (id)
);

-- 제품 실사 이미지. product 1:N이고 대표 이미지의 정본이다(옛 product.image_key를 흡수).
-- 감사 2종. hard delete — product.deleted_at이 정본이라 자체 플래그가 없다.
-- "제품당 대표 1장"은 부분 유니크 인덱스 uq_product_image_product_id가 강제하고,
-- source=CATALOG의 "최소 1장"과 제품당 상한 8장은 행 개수 조건이라 WAS가 강제한다.
CREATE TABLE product_image (
    id            BIGINT        NOT NULL DEFAULT nextval('product_image_id_seq'),
    product_id    BIGINT        NOT NULL,
    image_key     VARCHAR(1024) NOT NULL,
    display_order INT           NOT NULL DEFAULT 0,
    is_primary    BOOLEAN       NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by    BIGINT,
    updated_at    TIMESTAMPTZ,
    updated_by    BIGINT,
    CONSTRAINT pk_product_image PRIMARY KEY (id)
);

-- product 1:1(식별관계). 감사 2종 — product.deleted_at이 정본이다.
CREATE TABLE asset (
    product_id       BIGINT        NOT NULL,
    asset_key        VARCHAR(1024) NOT NULL,
    polygon_count    INT,
    review_status    VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    review_note      VARCHAR(500),
    verified_at      TIMESTAMPTZ,
    glb_export_mode  VARCHAR(20)   NOT NULL,
    finish           VARCHAR(20),
    rig_manifest     JSONB,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by       BIGINT,
    updated_at       TIMESTAMPTZ,
    updated_by       BIGINT,
    CONSTRAINT pk_asset PRIMARY KEY (product_id)
);

-- 발광 저작값의 정본. product 1:1(식별관계)이되 관계가 nullable — 빛을 내지 않는 제품은 행이 없다.
-- 부모가 asset이 아니라 product인 이유: 절차 생성 발광체(벽 RGB 스트립·선반 언더라이트)는 GLB가 없어
-- asset 행을 만들 수 없다(asset_key가 NOT NULL). 감사 2종 — product.deleted_at이 정본이다.
-- shape는 POINT / SPOT만 쓴다(AREA는 DERO-227 판정 대기).
CREATE TABLE product_emitter (
    product_id    BIGINT      NOT NULL,
    shape         VARCHAR(20) NOT NULL,
    distribution  VARCHAR(20),
    lumens        INT         NOT NULL,
    radius_mm     INT         NOT NULL,
    recolorable   BOOLEAN     NOT NULL,
    default_color VARCHAR(7)  NOT NULL,
    point_x_mm    INT,
    point_y_mm    INT,
    point_z_mm    INT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    BIGINT,
    updated_at    TIMESTAMPTZ,
    updated_by    BIGINT,
    CONSTRAINT pk_product_emitter PRIMARY KEY (product_id)
);

-- 감사 3종
CREATE TABLE desk_texture (
    id            BIGINT        NOT NULL DEFAULT nextval('desk_texture_id_seq'),
    name          VARCHAR(50)   NOT NULL,
    base_color    VARCHAR(7)    NOT NULL,
    albedo_key    VARCHAR(1024),
    roughness_key VARCHAR(1024),
    normal_key    VARCHAR(1024),
    roughness     NUMERIC(3, 2) NOT NULL,
    metalness     NUMERIC(3, 2) NOT NULL,
    tile_size_mm  INT,
    display_order INT           NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by    BIGINT,
    updated_at    TIMESTAMPTZ,
    updated_by    BIGINT,
    deleted_at    TIMESTAMPTZ,
    CONSTRAINT pk_desk_texture PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------
-- 3. 규격 — 슈퍼/서브 테이블 (전부 product_id가 PK 겸 FK, 감사 2종)
-- ---------------------------------------------------------------------

CREATE TABLE desk (
    product_id        BIGINT      NOT NULL,
    width_mm          INT         NOT NULL,
    depth_mm          INT         NOT NULL,
    height_mm         INT         NOT NULL,
    top_thickness_mm  INT         NOT NULL,
    edge_thickness_mm INT         NOT NULL,
    is_rounded        BOOLEAN     NOT NULL,
    desk_texture_id   BIGINT      NOT NULL,
    frame_type        VARCHAR(20) NOT NULL,
    allowed_load_g    INT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        BIGINT,
    updated_at        TIMESTAMPTZ,
    updated_by        BIGINT,
    CONSTRAINT pk_desk PRIMARY KEY (product_id)
);

CREATE TABLE monitor (
    product_id             BIGINT        NOT NULL,
    diagonal_inch          NUMERIC(4, 1) NOT NULL,
    aspect_width           INT           NOT NULL,
    aspect_height          INT           NOT NULL,
    bezel_mm               INT           NOT NULL,
    panel_thickness_mm     INT,
    panel_shape            VARCHAR(10)   NOT NULL,
    curvature_radius_mm    INT,
    stand_depth_mm         INT           NOT NULL,
    is_stand_detachable    BOOLEAN       NOT NULL,
    is_pivot_supported     BOOLEAN       NOT NULL,
    swivel_max_deg         INT,
    height_adjust_range_mm INT,
    tilt_min_deg           INT,
    tilt_max_deg           INT,
    weight_g               INT           NOT NULL,
    ports                  JSONB,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by             BIGINT,
    updated_at             TIMESTAMPTZ,
    updated_by             BIGINT,
    CONSTRAINT pk_monitor PRIMARY KEY (product_id)
);

CREATE TABLE arm (
    product_id               BIGINT      NOT NULL,
    arm_kind                 VARCHAR(20) NOT NULL,
    arm_type                 VARCHAR(30) NOT NULL,
    device_capacity          INT         NOT NULL,
    segment_count            INT,
    pole_height_mm           INT,
    reach_min_mm             INT,
    reach_max_mm             INT,
    height_min_mm            INT,
    height_max_mm            INT,
    is_clamp_mountable       BOOLEAN     NOT NULL,
    is_grommet_mountable     BOOLEAN     NOT NULL,
    is_wall_mountable        BOOLEAN     NOT NULL,
    clamp_min_mm             INT,
    clamp_max_mm             INT,
    tilt_min_deg             INT,
    tilt_max_deg             INT,
    swivel_range_deg         INT,
    pivot_range_deg          INT,
    is_vesa_plate_detachable BOOLEAN     NOT NULL,
    has_cable_management     BOOLEAN     NOT NULL,
    allowed_load_g           INT         NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by               BIGINT,
    updated_at               TIMESTAMPTZ,
    updated_by               BIGINT,
    CONSTRAINT pk_arm PRIMARY KEY (product_id)
);

-- 광학 6컬럼은 카탈로그 표기용 마커라 nullable이다 — 렌더 정본은 product_emitter다.
-- 치수 3컬럼은 호환성 판정 입력이라, boolean 2종은 nullable boolean 금지 때문에 NOT NULL로 남는다.
CREATE TABLE light (
    product_id                      BIGINT      NOT NULL,
    width_mm                        INT         NOT NULL,
    depth_mm                        INT         NOT NULL,
    height_mm                       INT         NOT NULL,
    is_color_temperature_adjustable BOOLEAN     NOT NULL,
    color_temperature_min_k         INT,
    color_temperature_max_k         INT,
    is_brightness_adjustable        BOOLEAN     NOT NULL,
    luminous_flux_min_lm            INT,
    luminous_flux_max_lm            INT,
    distribution                    VARCHAR(20),
    reach_mm                        INT,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                      BIGINT,
    updated_at                      TIMESTAMPTZ,
    updated_by                      BIGINT,
    CONSTRAINT pk_light PRIMARY KEY (product_id)
);

CREATE TABLE prop (
    product_id     BIGINT      NOT NULL,
    width_mm       INT         NOT NULL,
    depth_mm       INT         NOT NULL,
    height_mm      INT         NOT NULL,
    weight_g       INT,
    is_stackable   BOOLEAN     NOT NULL,
    mount_surface  VARCHAR(20) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     BIGINT,
    updated_at     TIMESTAMPTZ,
    updated_by     BIGINT,
    CONSTRAINT pk_prop PRIMARY KEY (product_id)
);

-- 감사 3종
CREATE TABLE vesa_spec (
    id         BIGINT      NOT NULL DEFAULT nextval('vesa_spec_id_seq'),
    width_mm   INT         NOT NULL,
    height_mm  INT         NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by BIGINT,
    updated_at TIMESTAMPTZ,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT pk_vesa_spec PRIMARY KEY (id)
);

-- 감사 2종(updated_at은 영원히 NULL)
CREATE TABLE product_vesa (
    id            BIGINT      NOT NULL DEFAULT nextval('product_vesa_id_seq'),
    product_id    BIGINT      NOT NULL,
    vesa_spec_id  BIGINT      NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    BIGINT,
    updated_at    TIMESTAMPTZ,
    updated_by    BIGINT,
    CONSTRAINT pk_product_vesa PRIMARY KEY (id),
    CONSTRAINT uq_product_vesa_product_id_vesa_spec_id UNIQUE (product_id, vesa_spec_id)
);

-- ---------------------------------------------------------------------
-- 4. 분류 태그
-- ---------------------------------------------------------------------

-- 감사 3종
CREATE TABLE vibe (
    id         BIGINT      NOT NULL DEFAULT nextval('vibe_id_seq'),
    name       VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by BIGINT,
    updated_at TIMESTAMPTZ,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT pk_vibe PRIMARY KEY (id)
);

-- 감사 2종(updated_at은 영원히 NULL)
CREATE TABLE product_vibe (
    id         BIGINT      NOT NULL DEFAULT nextval('product_vibe_id_seq'),
    product_id BIGINT      NOT NULL,
    vibe_id    BIGINT      NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by BIGINT,
    updated_at TIMESTAMPTZ,
    updated_by BIGINT,
    CONSTRAINT pk_product_vibe PRIMARY KEY (id),
    CONSTRAINT uq_product_vibe_product_id_vibe_id UNIQUE (product_id, vibe_id)
);

-- 감사 3종
CREATE TABLE hashtag (
    id          BIGINT       NOT NULL DEFAULT nextval('hashtag_id_seq'),
    name        VARCHAR(50)  NOT NULL,
    description VARCHAR(255),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by  BIGINT,
    updated_at  TIMESTAMPTZ,
    updated_by  BIGINT,
    deleted_at  TIMESTAMPTZ,
    CONSTRAINT pk_hashtag PRIMARY KEY (id)
);

-- 감사 2종(updated_at은 영원히 NULL)
CREATE TABLE product_hashtag (
    id         BIGINT      NOT NULL DEFAULT nextval('product_hashtag_id_seq'),
    product_id BIGINT      NOT NULL,
    hashtag_id BIGINT      NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by BIGINT,
    updated_at TIMESTAMPTZ,
    updated_by BIGINT,
    CONSTRAINT pk_product_hashtag PRIMARY KEY (id),
    CONSTRAINT uq_product_hashtag_product_id_hashtag_id UNIQUE (product_id, hashtag_id)
);

-- ---------------------------------------------------------------------
-- 5. 배치
-- ---------------------------------------------------------------------

-- 감사 3종. version은 낙관적 락(JPA @Version) 전용 — 애그리거트 루트에만 둔다.
CREATE TABLE placement (
    id                  BIGINT       NOT NULL DEFAULT nextval('placement_id_seq'),
    user_id             BIGINT,
    source_placement_id BIGINT,
    is_template         BOOLEAN      NOT NULL DEFAULT false,
    title               VARCHAR(100) NOT NULL,
    description         TEXT,
    visibility          VARCHAR(10)  NOT NULL DEFAULT 'PRIVATE',
    like_count          INT          NOT NULL DEFAULT 0,
    is_wall_left_on     BOOLEAN      NOT NULL DEFAULT true,
    is_wall_front_on    BOOLEAN      NOT NULL DEFAULT true,
    is_wall_right_on    BOOLEAN      NOT NULL DEFAULT false,
    is_room_light_on    BOOLEAN      NOT NULL DEFAULT true,
    budget_krw          INT,
    version             BIGINT       NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          BIGINT,
    updated_at          TIMESTAMPTZ,
    updated_by          BIGINT,
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT pk_placement PRIMARY KEY (id)
);

-- 배치당 정확히 1행. 감사 2종. 배치와 함께 사라지므로 하드 삭제.
CREATE TABLE placement_desk (
    id                BIGINT      NOT NULL DEFAULT nextval('placement_desk_id_seq'),
    placement_id      BIGINT      NOT NULL,
    spec_source       VARCHAR(10) NOT NULL,
    product_id        BIGINT,
    width_mm          INT         NOT NULL,
    depth_mm          INT         NOT NULL,
    height_mm         INT         NOT NULL,
    top_thickness_mm  INT         NOT NULL,
    edge_thickness_mm INT,
    desk_texture_id   BIGINT      NOT NULL,
    frame_type        VARCHAR(20) NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        BIGINT,
    updated_at        TIMESTAMPTZ,
    updated_by        BIGINT,
    CONSTRAINT pk_placement_desk PRIMARY KEY (id),
    CONSTRAINT uq_placement_desk_placement_id UNIQUE (placement_id)
);

-- 인스턴스 1개 = 행 1개. 감사 2종.
CREATE TABLE placed_item (
    id                          BIGINT        NOT NULL DEFAULT nextval('placed_item_id_seq'),
    placement_id                BIGINT        NOT NULL,
    product_id                  BIGINT        NOT NULL,
    position_x_mm               INT           NOT NULL,
    position_y_mm               INT           NOT NULL,
    position_z_mm               INT           NOT NULL,
    rotation_deg                NUMERIC(6, 2) NOT NULL DEFAULT 0,
    surface_type                VARCHAR(20)   NOT NULL,
    wall_side                   VARCHAR(10),
    is_vesa_mounted             BOOLEAN       NOT NULL DEFAULT false,
    mounted_to_placed_item_id   BIGINT,
    joint_values                JSONB,
    emitter_color               VARCHAR(7),
    emitter_brightness_scale    NUMERIC(3, 2),
    emitter_color_temperature_k INT,
    created_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by                  BIGINT,
    updated_at                  TIMESTAMPTZ,
    updated_by                  BIGINT,
    CONSTRAINT pk_placed_item PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------
-- 6. 커뮤니티
-- ---------------------------------------------------------------------

-- 감사 3종
CREATE TABLE comment (
    id           BIGINT      NOT NULL DEFAULT nextval('comment_id_seq'),
    placement_id BIGINT      NOT NULL,
    user_id      BIGINT,
    content      TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   BIGINT,
    updated_at   TIMESTAMPTZ,
    updated_by   BIGINT,
    deleted_at   TIMESTAMPTZ,
    CONSTRAINT pk_comment PRIMARY KEY (id)
);

-- 감사 2종(updated_at은 영원히 NULL)
CREATE TABLE placement_like (
    id           BIGINT      NOT NULL DEFAULT nextval('placement_like_id_seq'),
    user_id      BIGINT      NOT NULL,
    placement_id BIGINT      NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   BIGINT,
    updated_at   TIMESTAMPTZ,
    updated_by   BIGINT,
    CONSTRAINT pk_placement_like PRIMARY KEY (id),
    CONSTRAINT uq_placement_like_user_id_placement_id UNIQUE (user_id, placement_id)
);

-- 감사 2종(updated_at은 영원히 NULL)
CREATE TABLE product_like (
    id         BIGINT      NOT NULL DEFAULT nextval('product_like_id_seq'),
    user_id    BIGINT      NOT NULL,
    product_id BIGINT      NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by BIGINT,
    updated_at TIMESTAMPTZ,
    updated_by BIGINT,
    CONSTRAINT pk_product_like PRIMARY KEY (id),
    CONSTRAINT uq_product_like_user_id_product_id UNIQUE (user_id, product_id)
);

-- 감사 3종
CREATE TABLE placement_bookmark_group (
    id          BIGINT       NOT NULL DEFAULT nextval('placement_bookmark_group_id_seq'),
    user_id     BIGINT       NOT NULL,
    title       VARCHAR(50)  NOT NULL,
    description VARCHAR(255),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by  BIGINT,
    updated_at  TIMESTAMPTZ,
    updated_by  BIGINT,
    deleted_at  TIMESTAMPTZ,
    CONSTRAINT pk_placement_bookmark_group PRIMARY KEY (id)
);

-- 감사 2종(updated_at은 영원히 NULL). 한 배치는 사용자당 북마크 1건 — 그룹을 바꿔도 행이 늘지 않는다.
CREATE TABLE placement_bookmark (
    id                          BIGINT      NOT NULL DEFAULT nextval('placement_bookmark_id_seq'),
    user_id                     BIGINT      NOT NULL,
    placement_id                BIGINT      NOT NULL,
    placement_bookmark_group_id BIGINT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                  BIGINT,
    updated_at                  TIMESTAMPTZ,
    updated_by                  BIGINT,
    CONSTRAINT pk_placement_bookmark PRIMARY KEY (id),
    CONSTRAINT uq_placement_bookmark_user_id_placement_id UNIQUE (user_id, placement_id)
);

-- 데스크테리어 스토리 게시글. 배치와 별개 축이다(ADR-0011·ADR-0013). 감사 3종.
-- 배치 참조 컬럼(placement_id)을 두지 않는다 — 참조는 본문 content 안의 [[placement:ID]] 토큰이
-- 전부다. 단일 FK는 배치를 하나만 가리키는데 요구는 여러 개였다(REQ-COM-12).
-- visibility도 두지 않는다 — 글은 쓰는 행위 자체가 게시다.
CREATE TABLE post (
    id         BIGINT       NOT NULL DEFAULT nextval('post_id_seq'),
    user_id    BIGINT,
    title      VARCHAR(100) NOT NULL,
    content    TEXT         NOT NULL,
    like_count INT          NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by BIGINT,
    updated_at TIMESTAMPTZ,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT pk_post PRIMARY KEY (id)
);

-- 게시글에 붙는 사용자 실물 사진. 감사 2종(updated_at은 영원히 NULL). 게시글과 함께 사라지므로 하드 삭제.
-- 순서 컬럼을 두지 않는다 — 이미지는 본문 임의 위치에 ![alt](key)로 직렬화되므로 본문 안 위치가 곧
-- 순서다(ADR-0013 결정 5). is_primary는 순서가 아니라 목록 카드 썸네일로 쓸 "어느 것이냐"다.
-- 게시글당 상한 20장은 행 개수 조건이라 WAS가 강제한다.
CREATE TABLE post_image (
    id         BIGINT        NOT NULL DEFAULT nextval('post_image_id_seq'),
    post_id    BIGINT        NOT NULL,
    image_key  VARCHAR(1024) NOT NULL,
    is_primary BOOLEAN       NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by BIGINT,
    updated_at TIMESTAMPTZ,
    updated_by BIGINT,
    CONSTRAINT pk_post_image PRIMARY KEY (id)
);

-- post.like_count의 집계 원천. 감사 2종(updated_at은 영원히 NULL).
-- placement_like와 별도 테이블이다 — comment·placement_like에 post_id를 덧붙이는 다형성을 쓰지 않는다
-- (CHECK가 없어 "정확히 하나만 채워짐"을 DB가 못 지킨다. ADR-0011 결정 3).
CREATE TABLE post_like (
    id         BIGINT      NOT NULL DEFAULT nextval('post_like_id_seq'),
    user_id    BIGINT      NOT NULL,
    post_id    BIGINT      NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by BIGINT,
    updated_at TIMESTAMPTZ,
    updated_by BIGINT,
    CONSTRAINT pk_post_like PRIMARY KEY (id),
    CONSTRAINT uq_post_like_user_id_post_id UNIQUE (user_id, post_id)
);

-- 게시글 댓글. 구조는 comment(배치 댓글)와 같고 대상만 다르다. 감사 3종.
CREATE TABLE post_comment (
    id         BIGINT      NOT NULL DEFAULT nextval('post_comment_id_seq'),
    post_id    BIGINT      NOT NULL,
    user_id    BIGINT,
    content    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by BIGINT,
    updated_at TIMESTAMPTZ,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT pk_post_comment PRIMARY KEY (id)
);

-- post N:M hashtag 정션. 감사 2종(updated_at은 영원히 NULL). hashtag 마스터를 product_hashtag와
-- 공유한다 — 태그 값 자체는 제품이든 게시글이든 같은 어휘라 마스터를 둘로 나눌 이유가 없다.
CREATE TABLE post_hashtag (
    id         BIGINT      NOT NULL DEFAULT nextval('post_hashtag_id_seq'),
    post_id    BIGINT      NOT NULL,
    hashtag_id BIGINT      NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by BIGINT,
    updated_at TIMESTAMPTZ,
    updated_by BIGINT,
    CONSTRAINT pk_post_hashtag PRIMARY KEY (id),
    CONSTRAINT uq_post_hashtag_post_id_hashtag_id UNIQUE (post_id, hashtag_id)
);

-- ---------------------------------------------------------------------
-- 7. 상거래·AI
-- ---------------------------------------------------------------------

-- 감사 2종(수량이 바뀐다). cart 테이블은 두지 않는다.
CREATE TABLE cart_item (
    id         BIGINT      NOT NULL DEFAULT nextval('cart_item_id_seq'),
    user_id    BIGINT      NOT NULL,
    product_id BIGINT      NOT NULL,
    quantity   INT         NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by BIGINT,
    updated_at TIMESTAMPTZ,
    updated_by BIGINT,
    CONSTRAINT pk_cart_item PRIMARY KEY (id),
    CONSTRAINT uq_cart_item_user_id_product_id UNIQUE (user_id, product_id)
);

-- 감사 2종(updated_at은 영원히 NULL). 삭제하지 않는다 — 일일 생성 한도 카운트의 근거다.
CREATE TABLE generated_image (
    id           BIGINT        NOT NULL DEFAULT nextval('generated_image_id_seq'),
    user_id      BIGINT        NOT NULL,
    placement_id BIGINT,
    image_key    VARCHAR(1024) NOT NULL,
    time_of_day  VARCHAR(10)   NOT NULL,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by   BIGINT,
    updated_at   TIMESTAMPTZ,
    updated_by   BIGINT,
    CONSTRAINT pk_generated_image PRIMARY KEY (id)
);



-- ---------------------------------------------------------------------
-- 시퀀스 소유권 — 테이블과 함께 사라지게 한다(SERIAL이 암묵적으로 하는 것과 같다).
-- ---------------------------------------------------------------------

ALTER SEQUENCE user_id_seq OWNED BY "user".id;
ALTER SEQUENCE follow_id_seq OWNED BY follow.id;
ALTER SEQUENCE terms_id_seq OWNED BY terms.id;
ALTER SEQUENCE user_consent_id_seq OWNED BY user_consent.id;
ALTER SEQUENCE brand_id_seq OWNED BY brand.id;
ALTER SEQUENCE category_id_seq OWNED BY category.id;
ALTER SEQUENCE product_id_seq OWNED BY product.id;
ALTER SEQUENCE product_image_id_seq OWNED BY product_image.id;
ALTER SEQUENCE desk_texture_id_seq OWNED BY desk_texture.id;
ALTER SEQUENCE vesa_spec_id_seq OWNED BY vesa_spec.id;
ALTER SEQUENCE product_vesa_id_seq OWNED BY product_vesa.id;
ALTER SEQUENCE vibe_id_seq OWNED BY vibe.id;
ALTER SEQUENCE product_vibe_id_seq OWNED BY product_vibe.id;
ALTER SEQUENCE hashtag_id_seq OWNED BY hashtag.id;
ALTER SEQUENCE product_hashtag_id_seq OWNED BY product_hashtag.id;
ALTER SEQUENCE placement_id_seq OWNED BY placement.id;
ALTER SEQUENCE placement_desk_id_seq OWNED BY placement_desk.id;
ALTER SEQUENCE placed_item_id_seq OWNED BY placed_item.id;
ALTER SEQUENCE comment_id_seq OWNED BY comment.id;
ALTER SEQUENCE placement_like_id_seq OWNED BY placement_like.id;
ALTER SEQUENCE product_like_id_seq OWNED BY product_like.id;
ALTER SEQUENCE placement_bookmark_group_id_seq OWNED BY placement_bookmark_group.id;
ALTER SEQUENCE placement_bookmark_id_seq OWNED BY placement_bookmark.id;
ALTER SEQUENCE post_id_seq OWNED BY post.id;
ALTER SEQUENCE post_image_id_seq OWNED BY post_image.id;
ALTER SEQUENCE post_like_id_seq OWNED BY post_like.id;
ALTER SEQUENCE post_comment_id_seq OWNED BY post_comment.id;
ALTER SEQUENCE post_hashtag_id_seq OWNED BY post_hashtag.id;
ALTER SEQUENCE cart_item_id_seq OWNED BY cart_item.id;
ALTER SEQUENCE generated_image_id_seq OWNED BY generated_image.id;

-- =====================================================================
-- ② 외래 키
-- =====================================================================

ALTER TABLE follow
    ADD CONSTRAINT fk_follow_follower_id FOREIGN KEY (follower_id) REFERENCES "user" (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_follow_following_id FOREIGN KEY (following_id) REFERENCES "user" (id) ON DELETE CASCADE;

-- ON DELETE를 두지 않는다(NO ACTION) — 감사성 기록이라 사용자·약관이 사라져도 이력이 남아야 한다.
ALTER TABLE user_consent
    ADD CONSTRAINT fk_user_consent_user FOREIGN KEY (user_id) REFERENCES "user" (id),
    ADD CONSTRAINT fk_user_consent_terms FOREIGN KEY (terms_id) REFERENCES terms (id);

ALTER TABLE category
    ADD CONSTRAINT fk_category_parent_id FOREIGN KEY (parent_id) REFERENCES category (id);

ALTER TABLE product
    ADD CONSTRAINT fk_product_brand FOREIGN KEY (brand_id) REFERENCES brand (id),
    ADD CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES category (id),
    ADD CONSTRAINT fk_product_owner_user_id FOREIGN KEY (owner_user_id) REFERENCES "user" (id) ON DELETE SET NULL;

ALTER TABLE product_image
    ADD CONSTRAINT fk_product_image_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE;

ALTER TABLE asset
    ADD CONSTRAINT fk_asset_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE;

ALTER TABLE product_emitter
    ADD CONSTRAINT fk_product_emitter_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE;

ALTER TABLE desk
    ADD CONSTRAINT fk_desk_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_desk_desk_texture FOREIGN KEY (desk_texture_id) REFERENCES desk_texture (id);

ALTER TABLE monitor
    ADD CONSTRAINT fk_monitor_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE;

ALTER TABLE arm
    ADD CONSTRAINT fk_arm_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE;

ALTER TABLE light
    ADD CONSTRAINT fk_light_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE;

ALTER TABLE prop
    ADD CONSTRAINT fk_prop_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE;

ALTER TABLE product_vesa
    ADD CONSTRAINT fk_product_vesa_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_product_vesa_vesa_spec FOREIGN KEY (vesa_spec_id) REFERENCES vesa_spec (id) ON DELETE CASCADE;

ALTER TABLE product_vibe
    ADD CONSTRAINT fk_product_vibe_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_product_vibe_vibe FOREIGN KEY (vibe_id) REFERENCES vibe (id) ON DELETE CASCADE;

ALTER TABLE product_hashtag
    ADD CONSTRAINT fk_product_hashtag_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_product_hashtag_hashtag FOREIGN KEY (hashtag_id) REFERENCES hashtag (id) ON DELETE CASCADE;

ALTER TABLE placement
    ADD CONSTRAINT fk_placement_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_placement_source_placement_id FOREIGN KEY (source_placement_id) REFERENCES placement (id);

ALTER TABLE placement_desk
    ADD CONSTRAINT fk_placement_desk_placement FOREIGN KEY (placement_id) REFERENCES placement (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_placement_desk_product FOREIGN KEY (product_id) REFERENCES product (id),
    ADD CONSTRAINT fk_placement_desk_desk_texture FOREIGN KEY (desk_texture_id) REFERENCES desk_texture (id);

ALTER TABLE placed_item
    ADD CONSTRAINT fk_placed_item_placement FOREIGN KEY (placement_id) REFERENCES placement (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_placed_item_product FOREIGN KEY (product_id) REFERENCES product (id),
    ADD CONSTRAINT fk_placed_item_mounted_to_placed_item_id FOREIGN KEY (mounted_to_placed_item_id) REFERENCES placed_item (id);

ALTER TABLE comment
    ADD CONSTRAINT fk_comment_placement FOREIGN KEY (placement_id) REFERENCES placement (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE SET NULL;

ALTER TABLE placement_like
    ADD CONSTRAINT fk_placement_like_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_placement_like_placement FOREIGN KEY (placement_id) REFERENCES placement (id) ON DELETE CASCADE;

ALTER TABLE product_like
    ADD CONSTRAINT fk_product_like_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_product_like_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE;

ALTER TABLE placement_bookmark_group
    ADD CONSTRAINT fk_placement_bookmark_group_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE;

ALTER TABLE placement_bookmark
    ADD CONSTRAINT fk_placement_bookmark_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_placement_bookmark_placement FOREIGN KEY (placement_id) REFERENCES placement (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_placement_bookmark_placement_bookmark_group FOREIGN KEY (placement_bookmark_group_id) REFERENCES placement_bookmark_group (id) ON DELETE SET NULL;

ALTER TABLE post
    ADD CONSTRAINT fk_post_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE SET NULL;

ALTER TABLE post_image
    ADD CONSTRAINT fk_post_image_post FOREIGN KEY (post_id) REFERENCES post (id) ON DELETE CASCADE;

ALTER TABLE post_like
    ADD CONSTRAINT fk_post_like_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_post_like_post FOREIGN KEY (post_id) REFERENCES post (id) ON DELETE CASCADE;

ALTER TABLE post_comment
    ADD CONSTRAINT fk_post_comment_post FOREIGN KEY (post_id) REFERENCES post (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_post_comment_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE SET NULL;

ALTER TABLE post_hashtag
    ADD CONSTRAINT fk_post_hashtag_post FOREIGN KEY (post_id) REFERENCES post (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_post_hashtag_hashtag FOREIGN KEY (hashtag_id) REFERENCES hashtag (id) ON DELETE CASCADE;

ALTER TABLE cart_item
    ADD CONSTRAINT fk_cart_item_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_cart_item_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE;

ALTER TABLE generated_image
    ADD CONSTRAINT fk_generated_image_user FOREIGN KEY (user_id) REFERENCES "user" (id),
    ADD CONSTRAINT fk_generated_image_placement FOREIGN KEY (placement_id) REFERENCES placement (id) ON DELETE SET NULL;


-- =====================================================================
-- ③ 인덱스
-- =====================================================================

-- soft delete 테이블의 자연키 유니크 — 부분 유니크 인덱스.
-- 일반 UNIQUE면 삭제 표시된 행이 자리를 차지해 재가입·재등록이 막힌다.
CREATE UNIQUE INDEX uq_user_email ON "user" (email) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_user_provider_provider_id ON "user" (provider, provider_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_user_nickname ON "user" (nickname) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_brand_name ON brand (name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_desk_texture_name ON desk_texture (name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_vesa_spec_width_mm_height_mm ON vesa_spec (width_mm, height_mm) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_vibe_name ON vibe (name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_hashtag_name ON hashtag (name) WHERE deleted_at IS NULL;

-- 대표 이미지 "정확히 하나"를 강제하는 부분 유니크 인덱스.
-- CHECK가 아니라 인덱스라서 "DB에 비즈니스 로직 금지" 방침에 걸리지 않고, 대표 지정 요청이 동시에
-- 둘 들어와 대표가 둘이 되는 경쟁 조건을 막는다 — 둘이면 목록 카드가 어느 것을 쓸지 갈린다.
CREATE UNIQUE INDEX uq_product_image_product_id ON product_image (product_id) WHERE is_primary;
CREATE UNIQUE INDEX uq_post_image_post_id ON post_image (post_id) WHERE is_primary;

-- FK 인덱스 (Postgres는 FK에 인덱스를 자동으로 만들지 않는다).
-- 복합 UNIQUE의 선두 컬럼은 그 유니크 인덱스가 이미 커버하므로 만들지 않는다.
CREATE INDEX idx_follow_following_id ON follow (following_id);
CREATE INDEX idx_user_consent_user_id ON user_consent (user_id);
CREATE INDEX idx_user_consent_terms_id ON user_consent (terms_id);
CREATE INDEX idx_category_parent_id ON category (parent_id);
CREATE INDEX idx_product_brand_id ON product (brand_id);
CREATE INDEX idx_product_category_id ON product (category_id);
CREATE INDEX idx_product_owner_user_id ON product (owner_user_id);
CREATE INDEX idx_product_image_product_id ON product_image (product_id);
CREATE INDEX idx_desk_desk_texture_id ON desk (desk_texture_id);
CREATE INDEX idx_product_vesa_vesa_spec_id ON product_vesa (vesa_spec_id);
CREATE INDEX idx_product_vibe_vibe_id ON product_vibe (vibe_id);
CREATE INDEX idx_product_hashtag_hashtag_id ON product_hashtag (hashtag_id);
CREATE INDEX idx_placement_user_id ON placement (user_id);
CREATE INDEX idx_placement_source_placement_id ON placement (source_placement_id);
CREATE INDEX idx_placement_desk_product_id ON placement_desk (product_id);
CREATE INDEX idx_placement_desk_desk_texture_id ON placement_desk (desk_texture_id);
CREATE INDEX idx_placed_item_placement_id ON placed_item (placement_id);
CREATE INDEX idx_placed_item_product_id ON placed_item (product_id);
CREATE INDEX idx_placed_item_mounted_to_placed_item_id ON placed_item (mounted_to_placed_item_id);
CREATE INDEX idx_comment_placement_id ON comment (placement_id);
CREATE INDEX idx_comment_user_id ON comment (user_id);
CREATE INDEX idx_placement_like_placement_id ON placement_like (placement_id);
CREATE INDEX idx_product_like_product_id ON product_like (product_id);
CREATE INDEX idx_placement_bookmark_group_user_id ON placement_bookmark_group (user_id);
CREATE INDEX idx_placement_bookmark_placement_id ON placement_bookmark (placement_id);
CREATE INDEX idx_placement_bookmark_placement_bookmark_group_id ON placement_bookmark (placement_bookmark_group_id);
CREATE INDEX idx_post_user_id ON post (user_id);
CREATE INDEX idx_post_image_post_id ON post_image (post_id);
CREATE INDEX idx_post_like_post_id ON post_like (post_id);
CREATE INDEX idx_post_comment_post_id ON post_comment (post_id);
CREATE INDEX idx_post_comment_user_id ON post_comment (user_id);
CREATE INDEX idx_post_hashtag_hashtag_id ON post_hashtag (hashtag_id);
CREATE INDEX idx_cart_item_product_id ON cart_item (product_id);
CREATE INDEX idx_generated_image_placement_id ON generated_image (placement_id);

-- 조회 전용 복합 인덱스
CREATE INDEX idx_terms_code_effective_at ON terms (code, effective_at);
CREATE INDEX idx_placement_visibility_like_count ON placement (visibility, like_count);
CREATE INDEX idx_post_like_count ON post (like_count);
CREATE INDEX idx_generated_image_user_id_created_at ON generated_image (user_id, created_at);
