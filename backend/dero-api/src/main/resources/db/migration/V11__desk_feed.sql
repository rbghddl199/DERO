-- V11 — 데스크피드 전용 도메인 5테이블 신설 + 운영 마커 글 이관 (DERO-560).
-- docs/context/erd.md(스키마 정본)에서 파생한다 — desk_feed 계열 5테이블은 2026-08-10에 프리즈를
-- 열어 승인됐고(D32·ADR-0033) 정본 표에 실려 있다. erd.md는 손대지 않는다(동결 — HARNESS-RULES §4).
--
-- 종전 "post + 예약 해시태그 '데스크피드'" 구조를 대체한다. 대체 사유는 ADR-0033의 구조 결함 4건:
-- 사용자 태그 필터 불가(?hashtag를 마커가 점유) · 커뮤니티 목록 클라 필터 구멍 · 마커 충돌 ·
-- 가짜 댓글(post 댓글 엔드포인트 미구현). 콘텐츠는 사진 우선(캡션 선택·제목 없음), 배치 연결은
-- 단일 nullable FK다(토큰도 정션도 아님 — ADR-0033 결정 3).
--
-- 테이블 추가 + 마커 글 이관이라 ADR-0026의 확장/축소 규칙에서 확장 쪽이고 배포 1회로 나간다.
-- 구버전 WAS는 이 테이블을 읽지도 쓰지도 않고, 이관되는 마커 글은 구버전 화면(데스크피드 탭)이
-- 이미 새 구조로 교체되는 같은 배포에서만 사라진다.

-- =====================================================================
-- ① 시퀀스 — INCREMENT BY 50은 JPA @SequenceGenerator(allocationSize=50)와 짝(ADR-0006 결정 8)
-- =====================================================================

CREATE SEQUENCE desk_feed_id_seq INCREMENT BY 50;
CREATE SEQUENCE desk_feed_image_id_seq INCREMENT BY 50;
CREATE SEQUENCE desk_feed_like_id_seq INCREMENT BY 50;
CREATE SEQUENCE desk_feed_comment_id_seq INCREMENT BY 50;
CREATE SEQUENCE desk_feed_hashtag_id_seq INCREMENT BY 50;

-- =====================================================================
-- ② 테이블
-- =====================================================================

-- 데스크피드 실사 사진 글. post(스토리 글)·placement(컬렉션 배치)와 별개 축 — 사진이 정본이고
-- 본문 마크다운·제목·게시 상태 컬럼이 없다(쓰는 행위가 곧 게시). 감사 3종.
-- placement_id는 첨부한 3D 배치(NULL = 아직 첨부 안 함 — 사진 먼저, 배치 나중의 양방향 플로우).
CREATE TABLE desk_feed (
    id           BIGINT      NOT NULL DEFAULT nextval('desk_feed_id_seq'),
    user_id      BIGINT,
    placement_id BIGINT,
    content      TEXT,
    like_count   INT         NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   BIGINT,
    updated_at   TIMESTAMPTZ,
    updated_by   BIGINT,
    deleted_at   TIMESTAMPTZ,
    CONSTRAINT pk_desk_feed PRIMARY KEY (id)
);

-- 데스크피드 글의 사진. 글의 정본 콘텐츠라 최소 1장·상한 10장은 WAS가 강제한다.
-- 감사 2종(updated_at은 영원히 NULL — 사진 수정은 전체 교체다). 글과 함께 사라지므로 하드 삭제.
-- post_image와 반대로 display_order를 두고 is_primary를 안 둔다 — 본문이 없어 순서 컬럼이 유일한
-- 정본이고, 0번이 곧 목록 카드 대표다(ADR-0033 결정 2).
CREATE TABLE desk_feed_image (
    id            BIGINT        NOT NULL DEFAULT nextval('desk_feed_image_id_seq'),
    desk_feed_id  BIGINT        NOT NULL,
    image_key     VARCHAR(1024) NOT NULL,
    display_order INT           NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by    BIGINT,
    updated_at    TIMESTAMPTZ,
    updated_by    BIGINT,
    CONSTRAINT pk_desk_feed_image PRIMARY KEY (id),
    CONSTRAINT uq_desk_feed_image_desk_feed_id_display_order UNIQUE (desk_feed_id, display_order)
);

-- desk_feed.like_count의 집계 원천. 구조·근거는 post_like와 같고 대상만 다르다(D24 대상별 분리).
-- 감사 2종(updated_at은 영원히 NULL). hard delete — 좋아요 취소는 행 삭제다.
CREATE TABLE desk_feed_like (
    id           BIGINT      NOT NULL DEFAULT nextval('desk_feed_like_id_seq'),
    user_id      BIGINT      NOT NULL,
    desk_feed_id BIGINT      NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   BIGINT,
    updated_at   TIMESTAMPTZ,
    updated_by   BIGINT,
    CONSTRAINT pk_desk_feed_like PRIMARY KEY (id),
    CONSTRAINT uq_desk_feed_like_user_id_desk_feed_id UNIQUE (user_id, desk_feed_id)
);

-- 데스크피드 댓글. 구조는 post_comment와 같고 대상만 다르다. 대댓글 없음(플랫). 감사 3종.
CREATE TABLE desk_feed_comment (
    id           BIGINT      NOT NULL DEFAULT nextval('desk_feed_comment_id_seq'),
    desk_feed_id BIGINT      NOT NULL,
    user_id      BIGINT,
    content      TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   BIGINT,
    updated_at   TIMESTAMPTZ,
    updated_by   BIGINT,
    deleted_at   TIMESTAMPTZ,
    CONSTRAINT pk_desk_feed_comment PRIMARY KEY (id)
);

-- desk_feed N:M hashtag 정션. hashtag 마스터를 제품·게시글·배치와 공유한다(post_hashtag와 동형).
-- 감사 2종(updated_at은 영원히 NULL). hard delete. 태그 상한 5개는 WAS가 강제한다.
CREATE TABLE desk_feed_hashtag (
    id           BIGINT      NOT NULL DEFAULT nextval('desk_feed_hashtag_id_seq'),
    desk_feed_id BIGINT      NOT NULL,
    hashtag_id   BIGINT      NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   BIGINT,
    updated_at   TIMESTAMPTZ,
    updated_by   BIGINT,
    CONSTRAINT pk_desk_feed_hashtag PRIMARY KEY (id),
    CONSTRAINT uq_desk_feed_hashtag_desk_feed_id_hashtag_id UNIQUE (desk_feed_id, hashtag_id)
);

ALTER SEQUENCE desk_feed_id_seq OWNED BY desk_feed.id;
ALTER SEQUENCE desk_feed_image_id_seq OWNED BY desk_feed_image.id;
ALTER SEQUENCE desk_feed_like_id_seq OWNED BY desk_feed_like.id;
ALTER SEQUENCE desk_feed_comment_id_seq OWNED BY desk_feed_comment.id;
ALTER SEQUENCE desk_feed_hashtag_id_seq OWNED BY desk_feed_hashtag.id;

-- =====================================================================
-- ③ FK — soft delete 축(user·placement)은 SET NULL, 부모와 운명을 같이하는 쪽은 CASCADE
--    (erd.md 삭제 정책 절 — 참조 컬럼이 NOT NULL인 토글·정션은 SET NULL 불가)
-- =====================================================================

ALTER TABLE desk_feed
    ADD CONSTRAINT fk_desk_feed_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_desk_feed_placement FOREIGN KEY (placement_id) REFERENCES placement (id) ON DELETE SET NULL;

ALTER TABLE desk_feed_image
    ADD CONSTRAINT fk_desk_feed_image_desk_feed FOREIGN KEY (desk_feed_id) REFERENCES desk_feed (id) ON DELETE CASCADE;

ALTER TABLE desk_feed_like
    ADD CONSTRAINT fk_desk_feed_like_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_desk_feed_like_desk_feed FOREIGN KEY (desk_feed_id) REFERENCES desk_feed (id) ON DELETE CASCADE;

ALTER TABLE desk_feed_comment
    ADD CONSTRAINT fk_desk_feed_comment_desk_feed FOREIGN KEY (desk_feed_id) REFERENCES desk_feed (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_desk_feed_comment_user FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE SET NULL;

ALTER TABLE desk_feed_hashtag
    ADD CONSTRAINT fk_desk_feed_hashtag_desk_feed FOREIGN KEY (desk_feed_id) REFERENCES desk_feed (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_desk_feed_hashtag_hashtag FOREIGN KEY (hashtag_id) REFERENCES hashtag (id) ON DELETE CASCADE;

-- =====================================================================
-- ④ 인덱스 — Postgres는 FK에 인덱스를 자동으로 만들지 않는다(erd.md 전역 규칙).
--    복합 UNIQUE의 선두 컬럼(desk_feed_image.desk_feed_id · desk_feed_like.user_id ·
--    desk_feed_hashtag.desk_feed_id)은 그 유니크 인덱스가 커버하므로 단독 인덱스를 만들지 않는다.
-- =====================================================================

CREATE INDEX idx_desk_feed_user_id ON desk_feed (user_id);
-- 역방향 조회("이 배치의 실사 사진")가 이 인덱스 하나다 — ADR-0033 결정 3.
CREATE INDEX idx_desk_feed_placement_id ON desk_feed (placement_id);
CREATE INDEX idx_desk_feed_like_count ON desk_feed (like_count);
CREATE INDEX idx_desk_feed_like_desk_feed_id ON desk_feed_like (desk_feed_id);
CREATE INDEX idx_desk_feed_comment_desk_feed_id ON desk_feed_comment (desk_feed_id);
CREATE INDEX idx_desk_feed_comment_user_id ON desk_feed_comment (user_id);
CREATE INDEX idx_desk_feed_hashtag_hashtag_id ON desk_feed_hashtag (hashtag_id);

-- =====================================================================
-- ⑤ 운영 마커 글 이관 — 예약 해시태그 '데스크피드'가 붙은 살아있는 post(운영 1건)를 desk_feed로
--    복사하고 원본을 내린다(ADR-0033 결정 6, 세부 처리는 2026-08-10 박동규 결정).
--
--    idempotent: 마지막에 원본 post를 soft-delete하고 마커 정션 행을 지우므로, 재실행 시
--    선별 쿼리가 0행이 되어 no-op다. 마커 글이 없는 DB(로컬·테스트)에서도 no-op.
--
--    · 캡션 = 원본 title + 빈 줄 + 본문(이미지 마크다운 ![alt](key) 제거 후). desk_feed에는
--      제목이 없어 title을 캡션 앞줄에 합친다.
--    · 사진 = post_image를 is_primary 우선 → id 순으로 display_order 0부터(0번 = 대표).
--    · 태그 = 마커를 뺀 사용자 태그를 생성순 앞 5개만(desk_feed 태그 상한 5 — WAS 강제 규칙을
--      이관 데이터에도 적용).
--    · 좋아요 = post_like 전부. like_count는 post의 캐시값이 아니라 post_like 실측으로 다시
--      센다(desk_feed_like가 집계 원천이라 캐시가 원천과 어긋난 채 태어나면 안 된다).
--    · created_at·created_by 등 감사 컬럼은 원본을 보존한다(피드 정렬·작성 주체 추적).
-- =====================================================================

DO $$
DECLARE
	marker_post RECORD;
	new_desk_feed_id BIGINT;
	stripped_content TEXT;
BEGIN
	FOR marker_post IN
		SELECT p.id, p.user_id, p.title, p.content, p.created_at, p.created_by,
		       p.updated_at, p.updated_by
		FROM post p
		WHERE p.deleted_at IS NULL
		  AND EXISTS (
			SELECT 1
			FROM post_hashtag ph
			JOIN hashtag h ON h.id = ph.hashtag_id
			WHERE ph.post_id = p.id AND h.name = '데스크피드'
		  )
		ORDER BY p.id
	LOOP
		-- btrim 기본은 공백(' ')만 잘라 개행이 남는다 — 잘라낼 문자 집합을 명시한다.
		stripped_content := btrim(
			regexp_replace(marker_post.content, '!\[[^\]]*\]\([^)]*\)', '', 'g'), E' \t\r\n');

		INSERT INTO desk_feed (user_id, placement_id, content, like_count,
		                       created_at, created_by, updated_at, updated_by)
		VALUES (
			marker_post.user_id,
			NULL,
			marker_post.title
				|| CASE WHEN stripped_content = '' THEN '' ELSE E'\n\n' || stripped_content END,
			(SELECT count(*) FROM post_like pl WHERE pl.post_id = marker_post.id),
			marker_post.created_at, marker_post.created_by,
			marker_post.updated_at, marker_post.updated_by
		)
		RETURNING id INTO new_desk_feed_id;

		INSERT INTO desk_feed_image (desk_feed_id, image_key, display_order, created_at, created_by)
		SELECT new_desk_feed_id, pi.image_key,
		       row_number() OVER (ORDER BY pi.is_primary DESC, pi.id) - 1,
		       pi.created_at, pi.created_by
		FROM post_image pi
		WHERE pi.post_id = marker_post.id;

		INSERT INTO desk_feed_hashtag (desk_feed_id, hashtag_id, created_at, created_by)
		SELECT new_desk_feed_id, user_tag.hashtag_id, user_tag.created_at, user_tag.created_by
		FROM (
			SELECT ph.hashtag_id, ph.created_at, ph.created_by
			FROM post_hashtag ph
			JOIN hashtag h ON h.id = ph.hashtag_id
			WHERE ph.post_id = marker_post.id AND h.name <> '데스크피드'
			ORDER BY ph.created_at, ph.id
			LIMIT 5
		) user_tag;

		INSERT INTO desk_feed_like (desk_feed_id, user_id, created_at, created_by)
		SELECT new_desk_feed_id, pl.user_id, pl.created_at, pl.created_by
		FROM post_like pl
		WHERE pl.post_id = marker_post.id;

		-- 마커 정션 행 hard delete — 예약 태그 참조를 정리한다(ADR-0033 "마커 태그를 정리한다").
		DELETE FROM post_hashtag ph
		USING hashtag h
		WHERE ph.hashtag_id = h.id AND ph.post_id = marker_post.id AND h.name = '데스크피드';

		-- 원본 post soft-delete — 562에서 커뮤니티 클라 마커 필터가 제거되면 남은 원본이 커뮤니티
		-- 목록에 노출되므로 내린다. 나머지 자식 행(post_image·post_like·사용자 post_hashtag)은
		-- soft delete 관례대로 그대로 둔다.
		UPDATE post SET deleted_at = now() WHERE id = marker_post.id;
	END LOOP;
END $$;
