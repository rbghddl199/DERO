package com.brunchies.dero.community;

import com.brunchies.dero.global.entity.BaseEntity;
import jakarta.persistence.Column;
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
 * 게시글에 붙는 사용자 실물 사진. 감사 2종({@code updated_at}은 영원히 NULL).
 *
 * <p><b>{@link Post} 애그리거트 <u>안</u>이다</b>(ADR-0011 결정 8) — 게시글 없이 존재할 수 없고,
 * 이 글이 소유한 파일이라 글을 지울 때 같이 지워야 한다. 그래서 {@code PostImageRepository}를
 * 만들지 않는다: 저장·삭제는 {@link Post}를 통과한다.
 *
 * <p><b>순서 컬럼이 없다</b>(ADR-0013 결정 5) — 이미지는 본문 임의 위치에 삽입되고 그 자리에
 * {@code ![alt](key)}로 직렬화되므로 <b>본문 안 위치가 곧 순서</b>다. 컬럼을 두면 정본이 둘이 되어
 * 사용자가 본문에서 이미지를 옮기는 순간 거짓이 된다.
 *
 * <p><b>{@link #isPrimary}는 순서가 아니라 "어느 것이냐"다</b> — 목록 카드 썸네일을 고르는 값이고
 * 본문 안 위치와 무관해서 이미지를 옮겨도 어긋나지 않는다. "게시글당 썸네일 1장"은 부분 유니크
 * 인덱스 {@code uq_post_image_post_id}({@code WHERE is_primary})가 DB에서 강제한다. 게시글당 상한
 * 20장은 행 개수 조건이라 WAS가 강제한다.
 *
 * <p><b>hard delete다</b> — 게시글과 함께 사라진다. DDL 쪽 FK가 {@code ON DELETE CASCADE}지만 이건
 * DB 제약이므로 {@code cascade = CascadeType.REMOVE}로 옮겨 적지 않는다.
 */
@Entity
@Table(name = "post_image")
@SequenceGenerator(name = "post_image_seq", sequenceName = "post_image_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class PostImage extends BaseEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "post_image_seq")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "post_id", nullable = false)
	private Post post;

	/** 사진 object key. presigned 업로드가 돌려준 값을 그대로 담는다. */
	@Column(name = "image_key", nullable = false, length = 1024)
	private String imageKey;

	/** 목록 카드 썸네일로 쓰이는 한 장. 이미지가 0장이면 썸네일 없는 카드다. */
	@Column(name = "is_primary", nullable = false)
	private boolean isPrimary;

	public static PostImage create(Post post, String imageKey, boolean isPrimary) {
		return PostImage.builder()
				.post(post)
				.imageKey(imageKey)
				.isPrimary(isPrimary)
				.build();
	}

	/**
	 * 썸네일 지정을 바꾼다. <b>같은 게시글의 다른 사진에서 먼저 내려야 한다</b> — 부분 유니크
	 * 인덱스가 두 번째 {@code true}를 거부한다.
	 */
	public void changePrimary(boolean isPrimary) {
		this.isPrimary = isPrimary;
	}
}
