-- V13 — 데스크피드를 인스타형(제목 + 본문 선택 + 사진 스택)으로 되돌린다 (DERO-579).
-- docs/context/erd.md(스키마 정본)에서 파생한다 — desk_feed·desk_feed_image 개정은 D33이고
-- 근거는 ADR-0036이다.
--
-- V12가 하루 전에 넣은 post 동형 모델(마크다운 본문 NOT NULL · is_primary 표지)을 되돌린다.
-- **V12는 손대지 않는다** — 적용된 마이그레이션을 고치면 체크섬 불일치로 green이 부팅에서 죽어
-- 배포가 통째로 막힌다(ADR-0026 결정 5-1). 그래서 이 파일이 V12의 결과 위에서 변환한다.
--
-- title은 남는다 — 되돌리는 것은 본문 형식과 순서 정본이지 제목이 아니다(운영 4행이 증명한 것은
-- 제목 수요였다). desk_feed_product·배치 FK·좋아요·댓글·해시태그는 전부 무변경.
--
-- 확장(NOT NULL 완화)과 축소(컬럼 교체)가 섞여 있지만 배포 1회로 나간다 — V12와 같은 판단이고,
-- 같은 배포의 WAS만 이 스키마를 읽는다. **V12와 V13은 같은 배포로 나간다**(2026-08-11 박동규
-- 결정) — 따로 내보내면 운영에 마크다운 UI가 며칠 노출된다.

-- =====================================================================
-- ① 본문 — plain text·선택으로 되돌리고 이미지 마크다운을 벗긴다.
--    규칙은 프론트 removeImageMarkdown 유틸과 같다: `![...](...)`와 뒤따르는 개행 1개를 전부
--    떼고, 남는 것이 없으면 NULL이다(본문은 이제 선택 입력이다).
--    NOT NULL을 먼저 풀어야 UPDATE가 NULL을 쓸 수 있다.
-- =====================================================================

ALTER TABLE desk_feed ALTER COLUMN content DROP NOT NULL;

UPDATE desk_feed
-- BTRIM의 기본 제거 문자는 공백 하나뿐이라 개행을 남긴다 — 마크다운 본문은 이미지 앞뒤가 빈 줄이라
-- 벗기고 나면 개행만 남는 경우가 그냥 생긴다. 제거 문자를 명시한다.
SET content = NULLIF(
        BTRIM(regexp_replace(content, '!\[[^\]]*\]\([^)]*\)' || chr(10) || '?', '', 'g'),
              E' \t\r\n'),
        '')
WHERE content IS NOT NULL;

-- =====================================================================
-- ② 사진 — is_primary(부분 유니크) → display_order(복합 유니크).
--    기존 행에는 결정론적으로 부여한다: is_primary였던 행이 0번, 나머지는 id 오름차순.
--    V12가 post_image를 id 순으로 옮겼으므로 원본 글의 사진 순서가 그대로 보존된다.
--    NOT NULL은 값을 다 채운 뒤에 건다(빈 DB에서는 UPDATE가 0건이라 그냥 지나간다).
-- =====================================================================

ALTER TABLE desk_feed_image ADD COLUMN display_order INT;

UPDATE desk_feed_image target
SET display_order = ranked.display_order
FROM (
    SELECT id,
           row_number() OVER (PARTITION BY desk_feed_id ORDER BY is_primary DESC, id) - 1
               AS display_order
    FROM desk_feed_image
) ranked
WHERE target.id = ranked.id;

ALTER TABLE desk_feed_image ALTER COLUMN display_order SET NOT NULL;

-- 표지 1장을 강제하던 부분 유니크와, 그것이 FK를 못 커버해 따로 만들었던 인덱스를 함께 지운다.
DROP INDEX uq_desk_feed_image_desk_feed_id;
DROP INDEX idx_desk_feed_image_desk_feed_id;

ALTER TABLE desk_feed_image DROP COLUMN is_primary;

-- 글당 순서 유니크. 선두 컬럼(desk_feed_id)이 FK 인덱스를 겸하므로 단독 인덱스를 다시 만들지
-- 않는다(erd.md 전역 규칙 — Postgres는 FK에 인덱스를 자동으로 만들지 않지만 이것이 커버한다).
ALTER TABLE desk_feed_image
    ADD CONSTRAINT uq_desk_feed_image_desk_feed_id_display_order UNIQUE (desk_feed_id, display_order);
