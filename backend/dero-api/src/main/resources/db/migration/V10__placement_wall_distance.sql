-- V10 — placement_wall.distance_mm 추가 (DERO-548).
-- docs/context/erd.md(스키마 정본) 2026-08-10 개정에서 파생한다.
--
-- 벽 거리는 HUD에서 조정할 수 있는데 저장 계약에 자리가 없어 재로드마다 기본값으로 돌아갔다
-- (scene.ts FRONT_WALL_GAP_DEFAULT_M 주석이 "저장 대상이 아니라 모든 진입이 이 값으로 시작"으로
-- 그 상태를 명시하고 있었다). 마감·창문과 같은 축의 벽면 상태라 placement_wall에 붙인다 —
-- placement에 3컬럼으로 두면 벽 데이터가 두 곳으로 갈린다(erd.md "정본 이중화 회피").
--
-- **의미가 면마다 다르다** — LEFT/RIGHT는 책상 중심 기준 거리, FRONT는 책상 뒷변 기준 간격이다.
-- window_center_x_mm이 면마다 다른 축을 재는 것과 같은 성질이라 컬럼을 나누지 않는다.
--
-- 기본값도 면마다 다르다(좌/우 1550 · 전면 50). 컬럼 기본값 하나로는 표현할 수 없어 신규 저장의
-- 기본은 WAS(WallSnapshot)가 채우고, 여기서는 기존 행만 UPDATE로 맞춘다 — is_on의 "구현 기본값은
-- 우측 벽만 꺼짐"과 같은 자리다. 값은 엔진 상수와 같다(scene.ts WALL_LEFT_X 1.55m ·
-- FRONT_WALL_GAP_DEFAULT_M 0.05m) — 기존 배치가 시각적으로 같게 열린다.
--
-- **옛 4컬럼(theme_key · is_wall_*_on) DROP은 여전히 여기 없다 — 다음 배포로 미뤄져 V11이다.**
-- V9 머리말이 그 DROP을 "V10"이라 적었지만 적용된 마이그레이션은 체크섬이 걸려 고칠 수 없다
-- (V8이 "V9"라 적었다가 밀린 것과 같은 흐름). 사유는 그대로다: Flyway는 새 색 컨테이너가 뜰 때
-- 커밋하는데 그 시점에 옛 색이 아직 트래픽을 받고, 옛 빌드의 Placement 엔티티가 그 4컬럼을
-- SELECT한다.
ALTER TABLE placement_wall
    ADD COLUMN distance_mm INT NOT NULL DEFAULT 1550;

UPDATE placement_wall SET distance_mm = 50 WHERE wall_side = 'FRONT';
