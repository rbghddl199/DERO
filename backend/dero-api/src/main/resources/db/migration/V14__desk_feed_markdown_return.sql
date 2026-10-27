-- V14 — 데스크피드를 마크다운 본문(에디터)으로 되돌린다 (DERO-595).
-- docs/context/erd.md(스키마 정본)에서 파생한다 — desk_feed·desk_feed_image 3차 개정은 D34이고
-- 근거는 ADR-0037이다. 동인은 화면 취향이 아니라 사업 전제(SEO 사활)다.
--
-- **V12·V13은 손대지 않는다** — 적용된 마이그레이션을 고치면 체크섬 불일치로 green이 부팅에서
-- 죽어 배포가 통째로 막힌다(ADR-0026 결정 5-1). 그래서 이 파일이 V13의 결과 위에서 변환한다.
-- 방향은 V13의 역방향이고, 붙이는 규칙은 프론트 deskFeedContent.ts·BE DeskFeedContentImages와
-- 같은 `![](key)` 형태다.
--
-- title·desk_feed_product·배치 FK·좋아요·댓글·해시태그는 전부 무변경.
--
-- **V14와 FE/BE 코드는 같은 배포로 나간다**(2026-08-11 박동규 결정 — V12·V13 때와 같은 판단):
-- 따로 내보내면 스키마와 화면이 모순인 상태가 운영에 노출된다.

-- =====================================================================
-- ① 본문 — plain text 뒤에 사진을 display_order 순으로 이어 붙여 마크다운으로 되돌린다.
--    NOT NULL은 값을 다 채운 뒤에 건다.
--    사진도 본문도 없는 행(작성 후 업로드가 끊긴 글)은 빈 문자열이 된다 — 노출 게이트가 이미
--    숨기고 있는 글이라 화면에는 변화가 없고, 지우는 것은 이 마이그레이션의 몫이 아니다.
-- =====================================================================

UPDATE desk_feed df
SET content = BTRIM(
        COALESCE(BTRIM(df.content, E' \t\r\n'), '')
            || COALESCE(
                (SELECT string_agg(E'\n\n![](' || i.image_key || ')', '' ORDER BY i.display_order)
                 FROM desk_feed_image i
                 WHERE i.desk_feed_id = df.id),
                ''),
        E' \t\r\n');

ALTER TABLE desk_feed ALTER COLUMN content SET NOT NULL;

-- =====================================================================
-- ② 사진 — 순수 소속 레지스트리로 되돌린다(순서 정본은 본문 안 위치다).
--    복합 유니크가 사라지면 FK 인덱스를 겸하던 커버도 사라지므로 단독 인덱스를 복원한다
--    (erd.md 전역 규칙 — Postgres는 FK에 인덱스를 자동으로 만들지 않는다).
-- =====================================================================

ALTER TABLE desk_feed_image DROP CONSTRAINT uq_desk_feed_image_desk_feed_id_display_order;

ALTER TABLE desk_feed_image DROP COLUMN display_order;

CREATE INDEX idx_desk_feed_image_desk_feed_id ON desk_feed_image (desk_feed_id);
