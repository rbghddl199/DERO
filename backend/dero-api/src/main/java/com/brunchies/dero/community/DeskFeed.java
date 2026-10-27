package com.brunchies.dero.community;

import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.global.entity.BaseSoftDeleteEntity;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.product.Product;
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
import jakarta.persistence.OrderBy;
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
 * 데스크피드 실사 사진 글(D34·ADR-0037·REQ-COM-16/17). <b>제목 + 마크다운 본문</b>이고 사진은
 * 본문 안 {@code ![alt](key)}로 산다 — <b>본문 안 위치가 사진 순서의 유일한 정본</b>이다
 * ({@link DeskFeedImage}는 소속 레지스트리일 뿐이다. ADR-0036이 잠시 되돌렸던 plain text 본문을
 * ADR-0037이 재개정했다 — 동인은 SEO다).
 * {@code Placement}(컬렉션 배치)와는 여전히 별개 축이다. 감사 3종.
 *
 * <p><b>애그리거트 루트고 그 안에는 {@link DeskFeedImage}·{@link DeskFeedHashtag}만 있다</b> —
 * {@link Post}가 {@code PostImage}·{@code PostHashtag}를 품는 것과 같은 경계다(ADR-0011 결정 8).
 * {@link DeskFeedLike}·{@link DeskFeedComment}는 남이 만드는 것이라 각자 루트다.
 *
 * <p><b>배치 참조가 토큰이 아니라 단일 nullable FK다 — {@link Post}와 반대 결정이다</b>(ADR-0033
 * 결정 3). 사진 글 하나 = 책상 하나 = 배치 하나라 단일 FK로 충분하고, 역방향 조회("이 배치의 실사
 * 사진")를 {@code idx_desk_feed_placement_id} 하나로 얻는다. NULL = 아직 첨부 안 함 — 사진 먼저
 * 올리고 나중에 붙이는 양방향 플로우의 자리다. DDL이 {@code ON DELETE SET NULL}이라 배치가 물리
 * 삭제돼도 글은 남는다.
 *
 * <p><b>게시 상태 컬럼이 없다</b> — {@link Post}와 같은 근거(쓰는 행위가 곧 게시).
 *
 * <p>작성자는 <b>{@code ON DELETE SET NULL}이라 nullable이다</b> — 탈퇴해도 글은 남는다({@link Post}와
 * 동형).
 */
@Entity
@Table(name = "desk_feed")
@SequenceGenerator(name = "desk_feed_seq", sequenceName = "desk_feed_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DeskFeed extends BaseSoftDeleteEntity {

	/**
	 * 사진 상한(erd.md {@code desk_feed_image} 절, DERO-613으로 10→30). 행 개수 조건이라
	 * 인덱스로 표현할 수 없어 WAS가 강제한다.
	 *
	 * <p><b>상한을 아는 모든 자리가 이 상수를 봐야 한다.</b> 613이 값을 올릴 때
	 * {@code DeskFeedImageUploadUrlsRequest}의 {@code @Size(max = 10)}만 남아, 11장짜리 글이
	 * presign 1단계에서 400으로 죽고 작성 폼이 글을 통째로 롤백했다(DERO-625). 애너테이션이
	 * 요구하는 컴파일 타임 상수라 여기 두고, 서비스·요청 DTO가 함께 읽는다.
	 */
	public static final int MAX_IMAGES = 30;

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "desk_feed_seq")
	private Long id;

	/** 작성자. 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다. */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id")
	private User user;

	/**
	 * 첨부한 3D 배치(ADR-0033 결정 3). <b>본인 소유 + {@code PUBLIC}만 붙일 수 있고 그 검증은
	 * 서비스가 한다</b>(D25와 같은 규칙). 첨부 후 배치가 공개취소되면 <b>FK는 그대로 두고 응답의
	 * 배치 요약만 비운다</b>(ADR-0033 결정 5 — 화면이 카드를 숨긴다).
	 */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "placement_id")
	private Placement placement;

	@Column(name = "title", nullable = false, length = 100)
	private String title;

	/**
	 * 마크다운 본문 — <b>필수 입력이고 이미지({@code ![alt](key)})가 여기 산다</b>(ADR-0037).
	 * 본문 안 위치가 사진 순서의 정본이고 첫 이미지가 목록 카드 표지다.
	 * <b>"캡션"이라 부르지 않는다</b>(GLOSSARY).
	 *
	 * <p>{@code TEXT}라 {@code length}를 주지 않는다 — 길이를 주면 {@code VARCHAR(255)}로 매핑돼
	 * {@code ddl-auto: validate}가 타입 불일치로 부팅을 죽인다.
	 */
	@Column(name = "content", nullable = false, columnDefinition = "TEXT")
	private String content;

	/**
	 * {@link DeskFeedLike} 행 수의 집계 캐시({@code post.like_count}와 동형) — 인기순 정렬
	 * ({@code idx_desk_feed_like_count})용이고 정본은 {@code desk_feed_like} 표다.
	 */
	@Column(name = "like_count", nullable = false)
	private int likeCount;

	/**
	 * 글에 붙는 사용자 실물 사진의 <b>소속 레지스트리</b> — 순서 컬럼이 없다(ADR-0037). 순서와
	 * 대표는 {@link #content} 본문이 정한다. {@code id} 오름차순은 등록 순서일 뿐 표시 순서가
	 * 아니다 — 응답이 흔들리지 않게 고정할 뿐이다.
	 *
	 * <p>필드 초기화를 살리려고 {@link Builder}를 생성자에 붙였다({@link Post}와 같은 사유).
	 */
	@OneToMany(mappedBy = "deskFeed", cascade = CascadeType.ALL, orphanRemoval = true)
	@OrderBy("id asc")
	private List<DeskFeedImage> images = new ArrayList<>();

	/** 해시태그 정션. {@code hashtag} 마스터는 제품·게시글·배치와 공유한다({@code PostHashtag}와 동형). */
	@OneToMany(mappedBy = "deskFeed", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<DeskFeedHashtag> hashtags = new ArrayList<>();

	/**
	 * "이 책상에 쓰인 제품" 정션(ADR-0034 결정 5). 상한 10개는 WAS가 강제하고, 제품이 소프트
	 * 삭제되면 <b>행은 남기고 응답에서만 뺀다</b>(첨부 배치 카드와 같은 규칙).
	 */
	@OneToMany(mappedBy = "deskFeed", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<DeskFeedProduct> products = new ArrayList<>();

	@Builder(access = AccessLevel.PRIVATE)
	private DeskFeed(User user, Placement placement, String title, String content) {
		this.user = user;
		this.placement = placement;
		this.title = title;
		this.content = content;
	}

	/** 새 글. {@code likeCount}는 집계 캐시라 DDL 기본값과 같은 0에서 시작한다. */
	public static DeskFeed create(User user, Placement placement, String title, String content) {
		return DeskFeed.builder()
				.user(user)
				.placement(placement)
				.title(title)
				.content(content)
				.build();
	}

	/** 제목·본문 수정. 감사 3종이라 {@code updated_at}이 이 경로로 갱신된다({@link Post}와 동형). */
	public void updateContent(String title, String content) {
		this.title = title;
		this.content = content;
	}

	/** 배치 첨부/해제 — {@code null}이 해제다. 첨부 자격(본인 + PUBLIC) 검증은 서비스가 끝낸 뒤 부른다. */
	public void changePlacement(Placement placement) {
		this.placement = placement;
	}

	/**
	 * 사진도 루트를 통과한다 — {@code DeskFeedImageRepository}가 없다(ADR-0011 결정 8과 같은 경계).
	 * 남의 사진을 붙이려는 것은 호출부 버그라 500짜리 {@code ErrorCode}다({@code Post.addImage}와
	 * 같은 판단, ADR-0012 결정 4).
	 */
	public void addImage(DeskFeedImage image) {
		if (image.getDeskFeed() != this) {
			throw new BusinessException(CommunityErrorCode.DESK_FEED_IMAGE_NOT_OWNED);
		}
		images.add(image);
	}

	/** 이 글의 사진인지 확인하고 떼어 낸다 — {@code orphanRemoval}이 DELETE를 낸다. */
	public boolean removeImage(Long imageId) {
		return images.removeIf(image -> image.getId().equals(imageId));
	}

	/** 해시태그 집합을 diff로 맞춘다 — {@code clear()} + {@code addAll()} 금지 사유는 {@link Post#replaceHashtags}. */
	public void replaceHashtags(List<Hashtag> targets) {
		Set<Long> targetIds = targets.stream().map(Hashtag::getId).collect(Collectors.toSet());
		hashtags.removeIf(junction -> !targetIds.contains(junction.getHashtag().getId()));

		Set<Long> keptIds = hashtags.stream()
				.map(junction -> junction.getHashtag().getId())
				.collect(Collectors.toSet());
		for (Hashtag hashtag : targets) {
			if (keptIds.add(hashtag.getId())) {
				hashtags.add(DeskFeedHashtag.create(this, hashtag));
			}
		}
	}

	/**
	 * 사용된 제품 집합을 diff로 맞춘다 — {@code clear()} + {@code addAll()} 금지 사유는
	 * {@link Post#replaceHashtags}와 같다. Hibernate는 한 flush 안에서 INSERT를 DELETE보다 먼저
	 * 내므로, 겹치는 원소가 있는 교체를 clear+addAll로 쓰면 옛 행이 살아 있는 채로 같은 쌍을
	 * INSERT해 {@code uq_desk_feed_product_desk_feed_id_product_id}에 걸려 죽는다(겹치지 않는
	 * 교체로만 테스트하면 안 보인다).
	 */
	public void replaceProducts(List<Product> targets) {
		Set<Long> targetIds = targets.stream().map(Product::getId).collect(Collectors.toSet());
		products.removeIf(junction -> !targetIds.contains(junction.getProduct().getId()));

		Set<Long> keptIds = products.stream()
				.map(junction -> junction.getProduct().getId())
				.collect(Collectors.toSet());
		for (Product product : targets) {
			if (keptIds.add(product.getId())) {
				products.add(DeskFeedProduct.create(this, product));
			}
		}
	}

	/** 좋아요 집계 캐시 +1. 정본은 {@code desk_feed_like} 표다 — 행이 실제로 들어간 뒤에만 부른다. */
	public void increaseLikeCount() {
		this.likeCount++;
	}

	/** 좋아요 집계 캐시 -1. 지워진 행이 없으면 부르지 않고, 파생값이라 음수로는 안 내려간다. */
	public void decreaseLikeCount() {
		this.likeCount = Math.max(0, this.likeCount - 1);
	}
}
