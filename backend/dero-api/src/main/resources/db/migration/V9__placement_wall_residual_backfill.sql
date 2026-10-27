-- V9 — 벽면 행이 없는 배치의 잔여 백필 (ADR-0030, DERO-514).
--
-- V8(확장) 이후 blue-green 창에서 옛 WAS가 만든 배치는 placement_wall이 0행이고, 지금까지는
-- 상세 응답이 옛 3컬럼으로 3면을 합성해 버텼다(PlacementService.wallsOf). 이 배포에서 그 합성이
-- 사라지므로 여기서 행을 만들어 "배치당 3행" 불변을 회복한다. 매핑은 V8과 같은 표다 — 같은
-- 입력이 같은 방으로 열려야 한다.
--
-- **옛 4컬럼(theme_key · is_wall_*_on) DROP은 여기 없다 — 다음 배포의 V10이다.**
-- Flyway는 새 색 컨테이너가 뜰 때 커밋하는데 그 시점에 **옛 색이 아직 트래픽을 받고 있고**,
-- 옛 빌드의 Placement 엔티티는 그 4컬럼을 SELECT한다. 같은 배포에 DROP을 넣으면 nginx 스위치
-- 전까지 배치 조회·저장이 통째로 500이다(V8 머리말이 경고한 바로 그 창). 컬럼은 NOT NULL +
-- DEFAULT라 이 배포의 새 코드가 값을 안 실어도 INSERT가 성립한다.
UPDATE placement p SET floor_variant = CASE p.theme_key
           WHEN 'white-clean' THEN 'LIGHT_OAK'
           WHEN 'dark-studio' THEN 'WALNUT'
           ELSE p.floor_variant
       END
 WHERE NOT EXISTS (SELECT 1 FROM placement_wall w WHERE w.placement_id = p.id);

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
CROSS JOIN (VALUES ('LEFT'), ('FRONT'), ('RIGHT')) AS side(wall_side)
WHERE NOT EXISTS (SELECT 1 FROM placement_wall w WHERE w.placement_id = p.id);
