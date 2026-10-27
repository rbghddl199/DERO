package com.brunchies.dero.community;

import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.global.entity.BaseSoftDeleteEntity;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.user.User;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 데스크테리어 스토리 게시글. <b>배치와 별개 축이다</b>(ADR-0011·ADR-0013, D25·REQ-COM-12).
 * 감사 3종.
 *
 * <p><b>애그리거트 루트고 그 안에는 {@link PostImage}만 있다</b>(ADR-0011 결정 8). 사진은 글이
 * 소유한 파일이라 글을 지울 때 같이 지워야 하므로 {@code cascade} + {@code orphanRemoval}을 걸고
 * {@code PostImageRepository}를 만들지 않는다. 반대로 {@link PostLike}·{@link PostComment}는
 * <b>각자 루트</b>다 — 남이 누르고 남이 쓰는 것이라 본문과 잠깐 어긋나도 무해하고, 여기 넣으면
 * 좋아요 하나 누르자고 글+사진 컬렉션을 통째로 로드하게 된다.
 *
 * <p><b>배치 참조 컬럼이 없다</b>(ADR-0013 결정 1·2) — 참조는 본문 {@link #content} 안의
 * {@code [[placement:ID]]} 토큰이 전부다. 단일 FK는 배치를 하나만 가리키는데 요구는 여러
 * 개였고(REQ-COM-12), 프론트가 이미 같은 형태의 토큰 파이프라인을 쓴다. 대가로 "이 배치를 인용한
 * 글 찾기"가 LIKE 스캔이고, 배치가 삭제되면 죽은 토큰이 남아 플레이스홀더로 렌더된다.
 *
 * <p><b>게시 상태 컬럼이 없다</b>({@code placement.publish_status} 같은 것) — 글은 쓰는 행위 자체가
 * 게시다. 배치는 3D 작업물이라 "만들었지만 아직 안 보여줄래"가 자연스럽지만 스토리 글은 안 보여줄
 * 거면 쓸 이유가 없다.
 *
 * <p>작성자는 <b>{@code ON DELETE SET NULL}이라 nullable이다</b> — 탈퇴해도 글은 남고 작성자만
 * 비워진다. 남이 좋아요·댓글을 단 글이 탈퇴로 통째 사라지면 그 상호작용도 같이 증발한다.
 */
@Entity
@Table(name = "post")
@SequenceGenerator(name = "post_seq", sequenceName = "post_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Post extends BaseSoftDeleteEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "post_seq")
	private Long id;

	/** 작성자. 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다. */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id")
	private User user;

	@Column(name = "title", nullable = false, length = 100)
	private String title;

	/**
	 * 본문. <b>배치 참조({@code [[placement:ID]]})와 이미지({@code ![alt](key)})가 여기 산다</b> —
	 * 둘 다 본문 안 위치가 정본이다.
	 *
	 * <p><b>{@code TEXT}라 {@code length}를 주지 않는다</b> — 길이를 주면 {@code VARCHAR(255)}로
	 * 매핑돼 {@code ddl-auto: validate}가 타입 불일치로 부팅을 죽인다.
	 */
	@Column(name = "content", nullable = false, columnDefinition = "TEXT")
	private String content;

	/**
	 * {@link PostLike} 행 수의 집계 캐시다 — 목록을 인기순으로 정렬할 때
	 * ({@code idx_post_like_count}) 매번 세지 않기 위해 둔다. 정본은 여전히 {@code post_like}
	 * 테이블이고 이 값은 파생이다.
	 */
	@Column(name = "like_count", nullable = false)
	private int likeCount;

	/**
	 * 게시글에 붙는 사용자 실물 사진. <b>순서 컬럼이 없다</b> — 본문 안 위치가 곧 순서다
	 * (ADR-0013 결정 5).
	 *
	 * <p>필드 초기화를 살리려고 {@link Builder}를 클래스가 아니라 <b>생성자</b>에 붙였다 —
	 * 클래스 레벨 {@code @Builder}는 이 초기화를 {@code @Builder.Default}로 옮겨 가므로 JPA가 쓰는
	 * 기본 생성자 경로에서 컬렉션이 NULL이 된다.
	 */
	@OneToMany(mappedBy = "post", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<PostImage> images = new ArrayList<>();

	/**
	 * 해시태그 정션(ADR-0013 결정 6). {@code product_hashtag}가 {@code Product} 안인 것과 같이
	 * 이것도 {@link Post} 안이라 {@code PostHashtagRepository}를 만들지 않는다.
	 */
	@OneToMany(mappedBy = "post", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<PostHashtag> hashtags = new ArrayList<>();

	@Builder(access = AccessLevel.PRIVATE)
	private Post(User user, String title, String content) {
		this.user = user;
		this.title = title;
		this.content = content;
	}

	/** 새 게시글. {@code likeCount}는 집계 캐시라 DDL 기본값과 같은 0에서 시작한다. */
	public static Post create(User user, String title, String content) {
		return Post.builder()
				.user(user)
				.title(title)
				.content(content)
				.build();
	}

	/** 제목·본문 수정. 감사 3종이라 {@code updated_at}이 이 경로로 갱신된다. */
	public void updateContent(String title, String content) {
		this.title = title;
		this.content = content;
	}

	/**
	 * 사진도 루트를 통과한다 — {@code PostImageRepository}가 없다(ADR-0011 결정 8).
	 *
	 * <p>남의 사진을 붙이려는 것은 호출부 버그다. {@code Placement.addItem}은 같은 자리에서
	 * {@code IllegalArgumentException}을 쓰지만 그건 freeze된 기존 위반이고, 신규 코드는
	 * <b>{@code BusinessException} + {@code ErrorCode}</b>만 쓴다 — ADR-0012 결정 4가
	 * "호출부 버그는 {@code IllegalStateException}" 안을 버렸다(잡히지 않아 code도 문구도 없이
	 * 500으로 나간다).
	 */
	public void addImage(PostImage image) {
		if (image.getPost() != this) {
			throw new BusinessException(CommunityErrorCode.POST_IMAGE_NOT_OWNED);
		}
		images.add(image);
	}

	/** 이 글의 사진인지 확인하고 떼어 낸다 — {@code orphanRemoval}이 DELETE를 낸다. */
	public boolean removeImage(Long imageId) {
		return images.removeIf(image -> image.getId().equals(imageId));
	}

	/**
	 * 지금 대표인 사진을 전부 내린다. 새 대표를 올리기 <b>전에</b> 부르고 그 사이에 flush해야 한다 —
	 * Hibernate는 한 flush 안에서 INSERT를 UPDATE보다 먼저 내므로 같이 두면 부분 유니크
	 * {@code uq_post_image_post_id}({@code WHERE is_primary})가 새 행의 {@code true}를 거부한다
	 * ({@code Product.replaceVesaSpecs}가 밟은 것과 같은 순서 함정이다).
	 */
	public void demotePrimaryImages() {
		for (PostImage image : images) {
			image.changePrimary(false);
		}
	}

	/**
	 * 해시태그 집합을 통째로 맞춘다. <b>{@code clear()} + {@code addAll()}이 아니라 diff다</b> —
	 * Hibernate는 한 flush 안에서 INSERT를 DELETE보다 먼저 내므로, 기존 원소가 남는 교체를
	 * clear+addAll로 쓰면 옛 행이 살아 있는 채로 같은 쌍을 INSERT해
	 * {@code uq_post_hashtag_post_id_hashtag_id}에 걸려 죽는다({@code product/CLAUDE.md}의
	 * {@code replaceVesaSpecs} 사고와 같은 자리다 — 겹치지 않는 교체로만 테스트하면 안 보인다).
	 */
	public void replaceHashtags(List<Hashtag> targets) {
		Set<Long> targetIds = targets.stream().map(Hashtag::getId).collect(Collectors.toSet());
		hashtags.removeIf(junction -> !targetIds.contains(junction.getHashtag().getId()));

		Set<Long> keptIds = hashtags.stream()
				.map(junction -> junction.getHashtag().getId())
				.collect(Collectors.toSet());
		for (Hashtag hashtag : targets) {
			if (keptIds.add(hashtag.getId())) {
				hashtags.add(PostHashtag.create(this, hashtag));
			}
		}
	}

	/**
	 * 좋아요 집계 캐시를 1 올린다. <b>정본은 {@code post_like} 표이고 이 값은 파생이다</b> —
	 * 좋아요 행이 실제로 들어간 뒤에만 부른다. 이미 눌린 상태의 재요청(멱등)에서는 부르지 않는다.
	 */
	public void increaseLikeCount() {
		this.likeCount++;
	}

	/**
	 * 좋아요 집계 캐시를 1 내린다. 지워진 행이 없으면 부르지 않는다. 파생값이라 원천과 어긋날 수
	 * 있으므로 음수로는 내려가지 않게 막는다 — 음수 카운트는 어떤 화면에서도 뜻이 없다.
	 */
	public void decreaseLikeCount() {
		this.likeCount = Math.max(0, this.likeCount - 1);
	}
}
