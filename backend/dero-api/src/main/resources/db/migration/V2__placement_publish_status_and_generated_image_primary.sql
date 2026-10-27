-- V2 — placement.visibility → publish_status(4값) · generated_image.is_primary 신설.
-- docs/context/erd.md(스키마 정본) 2026-07-31 개정에서 파생. 근거는 ADR-0015 결정 1·6.
--
-- V1__baseline.sql은 이 시점부터 동결이다(2026-07-31, 박동규 지시) — 이 개정을 V1에 되돌려 적지 말 것.
-- 이미 적용된 V1의 체크섬이 바뀌면 팀원 로컬 DB가 Migration checksum mismatch로 부팅에서 죽는다.


-- 배치 게시 상태. 종전 visibility(PUBLIC/PRIVATE 2값)를 개명·확장했다 —
-- PRIVATE(내 작업실, 기본값) / PENDING(AI 상상도 생성 대기) / PUBLIC(데스크 피드 노출) / FAILED(생성 실패).
-- 데스크 피드 노출은 PUBLIC 하나뿐이고 나머지 셋은 전부 비노출이다. PUBLIC·FAILED는 서버만 정한다.
-- RENAME COLUMN은 타입·NOT NULL·DEFAULT 'PRIVATE'를 그대로 들고 가므로 재선언하지 않는다.
-- 값 4개는 전부 10자 이하라 VARCHAR(10)을 넓힐 필요도 없다.
ALTER TABLE placement RENAME COLUMN visibility TO publish_status;

-- 데스크 피드 인기순 목록용 복합 인덱스. 컬럼 개명에 맞춰 이름도 같이 옮긴다.
ALTER INDEX idx_placement_visibility_like_count RENAME TO idx_placement_publish_status_like_count;


-- 데스크 피드 카드에 쓰이는 대표 상상도 1장. 한 업로드가 3행을 만들고 그중 정확히 1행만 true다.
ALTER TABLE generated_image ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT false;

-- "배치당 피드 대표 1장"을 강제하는 부분 유니크 인덱스. product_image·post_image와 같은 형태다 —
-- CHECK가 아니라 인덱스라서 "DB에 비즈니스 로직 금지" 방침에 걸리지 않고, 대표 지정 요청이 동시에
-- 둘 들어와 대표가 둘이 되는 경쟁 조건을 막는다(둘이면 피드 카드가 어느 것을 쓸지 갈린다).
-- placement_id가 NULL인 행(출처 배치 삭제분)은 Postgres에서 유니크 검사를 통과하므로 이력이 막히지 않는다.
CREATE UNIQUE INDEX uq_generated_image_placement_id ON generated_image (placement_id) WHERE is_primary;
