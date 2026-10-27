package com.brunchies.dero.community;

import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.global.entity.BaseEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * {@code desk_feed} N:M {@code hashtag} 정션. 감사 2종({@code updated_at}은 영원히 NULL).
 *
 * <p><b>{@code hashtag} 마스터를 제품·게시글·배치와 공유한다</b>({@code PostHashtag}와 동형 — 붙는
 * 대상만 정션으로 가른다). 종전 마커 구조에서 {@code ?hashtag} 파라미터를 예약 태그가 점유해 사용자
 * 태그 필터가 불가능했다 — 이 정션이 태그 칩 필터(REQ-COM-16)를 성립시킨다. 태그 상한 5개는 WAS가
 * 강제한다.
 *
 * <p><b>hard delete 테이블이라 {@code deleted_at}이 없다.</b> soft delete와 {@code UNIQUE}는
 * 충돌한다 — 태그를 뗀 행을 남겨두면 같은 태그 재부착이
 * {@code uq_desk_feed_hashtag_desk_feed_id_hashtag_id}에 막힌다.
 *
 * <p>FK 2개가 전부 DDL 쪽 {@code ON DELETE CASCADE}다 — DB 제약이므로
 * {@code cascade = CascadeType.REMOVE}로 옮겨 적지 않는다. PK는 대리키 {@code id}다.
 */
@Entity
@Table(name = "desk_feed_hashtag")
@SequenceGenerator(name = "desk_feed_hashtag_seq", sequenceName = "desk_feed_hashtag_id_seq",
		allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class DeskFeedHashtag extends BaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "desk_feed_hashtag_seq")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "desk_feed_id", nullable = false)
	private DeskFeed deskFeed;

	/** 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다 — 걸면 저장이 경계를 넘어 번진다. */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "hashtag_id", nullable = false)
	private Hashtag hashtag;

	public static DeskFeedHashtag create(DeskFeed deskFeed, Hashtag hashtag) {
		return DeskFeedHashtag.builder()
				.deskFeed(deskFeed)
				.hashtag(hashtag)
				.build();
	}
}
