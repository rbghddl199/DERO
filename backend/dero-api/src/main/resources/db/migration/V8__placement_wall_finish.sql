-- V8 — placement_wall 신설 + placement 바닥·시간대 3컬럼 추가 (ADR-0030, D31, DERO-506).
-- docs/context/erd.md(스키마 정본) 2026-08-08 개정에서 파생한다.
--
-- ADR-0026 확장/축소의 "확장"이다 — theme_key·is_wall_*_on 4컬럼은 여기서 지우지 않는다.
-- Flyway는 헬스 게이트보다 먼저 커밋하므로 배포가 실패해도 스키마는 안 돌아가고, blue-green이라
-- 구·신 버전이 같은 스키마를 동시에 본다: 옛 프론트가 아직 themeKey를 보내는 동안 그 컬럼이
-- 살아 있어야 한다. 삭제는 다음 배포의 V9다.
--
-- 벽면 마감의 값 집합(material·variant)은 프론트 코드가 정본이라 CHECK·enum으로 닫지 않는다
-- (ADR-0021 결정 1 계승). WAS는 형식만 검증한다.

CREATE SEQUENCE placement_wall_id_seq INCREMENT BY 50;

-- 배치당 정확히 3행(좌·전면·우). 배치와 함께 사라지므로 하드 삭제. 감사 2종.
CREATE TABLE placement_wall (
    id                 BIGINT      NOT NULL DEFAULT nextval('placement_wall_id_seq'),
    placement_id       BIGINT      NOT NULL,
    wall_side          VARCHAR(10) NOT NULL,
    is_on              BOOLEAN     NOT NULL DEFAULT true,
    material           VARCHAR(30) NOT NULL DEFAULT 'PAINT',
    -- variant는 기본값을 두지 않는다 — 계열마다 유효 집합이 달라 임의 기본값은 미입력을
    -- 잘못된 변형으로 둔갑시킨다(erd.md).
    variant            VARCHAR(30) NOT NULL,
    has_window         BOOLEAN     NOT NULL DEFAULT false,
    -- 창문 4컬럼은 넷 다 있거나 넷 다 없다 — 강제는 WAS가 한다(전역 규칙: CHECK 미사용).
    window_center_x_mm INT,
    window_center_y_mm INT,
    window_width_mm    INT,
    window_height_mm   INT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by         BIGINT,
    updated_at         TIMESTAMPTZ,
    updated_by         BIGINT,
    CONSTRAINT pk_placement_wall PRIMARY KEY (id),
    CONSTRAINT fk_placement_wall_placement FOREIGN KEY (placement_id)
        REFERENCES placement (id) ON DELETE CASCADE,
    -- 조회 인덱스를 겸한다 — 항상 placement_id로 3행을 통째로 읽는다.
    CONSTRAINT uq_placement_wall_placement_id_wall_side UNIQUE (placement_id, wall_side)
);

ALTER TABLE placement
    ADD COLUMN floor_material VARCHAR(30) NOT NULL DEFAULT 'WOOD',
    ADD COLUMN floor_variant  VARCHAR(30) NOT NULL DEFAULT 'OAK',
    ADD COLUMN time_of_day    VARCHAR(10) NOT NULL DEFAULT 'DAY';

-- 이관 매핑 (spec: .scratch/DERO-502-room-surface/spec.md "이관 매핑" — 결정론적, 무회귀.
-- 프론트 계열 모듈(티켓 03·04)이 같은 토큰을 정의해야 한다):
--   theme_key    | 좌               | 전면            | 우              | 바닥
--   neutral      | PAINT NEUTRAL    | PAINT NEUTRAL   | PAINT NEUTRAL   | WOOD OAK
--   oak-warm     | WOOD_SLAT OAK    | WOOD_SLAT OAK   | PAINT WARM_GRAY | WOOD OAK
--   white-clean  | PAINT WHITE      | WOOD_SLAT ASH   | PAINT WHITE     | WOOD LIGHT_OAK
--   dark-studio  | PAINT CHARCOAL   | PAINT CHARCOAL  | PAINT CHARCOAL  | WOOD WALNUT
-- 미상 키는 neutral과 같게 접는다 — 프론트의 "미상 값은 PAINT 기본 변형 폴백"과 같은 판단이다.
-- has_window는 전부 false, time_of_day는 전부 DAY(컬럼 기본값), is_on은 옛 boolean 그대로 —
-- 기존 배치가 시각적으로 같게 열린다. 소프트 삭제된 배치도 채운다(복구되면 벽이 있어야 한다).
INSERT INTO placement_wall (placement_id, wall_side, is_on, material, variant)
SELECT p.id,
       side.wall_side,
       CASE side.wall_side
           WHEN 'LEFT' THEN p.is_wall_left_on
           WHEN 'FRONT' THEN p.is_wall_front_on
           ELSE p.is_wall_right_on
       END,
       CASE
           WHEN p.theme_key = 'oak-warm' AND side.wall_side IN ('LEFT', 'FRONT') THEN 'WOOD_SLAT'
           WHEN p.theme_key = 'white-clean' AND side.wall_side = 'FRONT' THEN 'WOOD_SLAT'
           ELSE 'PAINT'
       END,
       CASE
           WHEN p.theme_key = 'oak-warm' AND side.wall_side IN ('LEFT', 'FRONT') THEN 'OAK'
           WHEN p.theme_key = 'oak-warm' THEN 'WARM_GRAY'
           WHEN p.theme_key = 'white-clean' AND side.wall_side = 'FRONT' THEN 'ASH'
           WHEN p.theme_key = 'white-clean' THEN 'WHITE'
           WHEN p.theme_key = 'dark-studio' THEN 'CHARCOAL'
           ELSE 'NEUTRAL'
       END
FROM placement p
CROSS JOIN (VALUES ('LEFT'), ('FRONT'), ('RIGHT')) AS side(wall_side);

UPDATE placement SET floor_variant = 'LIGHT_OAK' WHERE theme_key = 'white-clean';
UPDATE placement SET floor_variant = 'WALNUT' WHERE theme_key = 'dark-studio';
