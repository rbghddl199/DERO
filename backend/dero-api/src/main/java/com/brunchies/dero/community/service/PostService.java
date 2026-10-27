package com.brunchies.dero.community.service;

import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.catalog.repository.HashtagRepository;
import com.brunchies.dero.community.CommunityErrorCode;
import com.brunchies.dero.community.PlacementEmbedTokens;
import com.brunchies.dero.community.Post;
import com.brunchies.dero.community.PostChangedEvent;
import com.brunchies.dero.community.PostHashtag;
import com.brunchies.dero.community.PostImage;
import com.brunchies.dero.community.dto.PostDetailResponse;
import com.brunchies.dero.community.dto.PostImageRegisterRequest;
import com.brunchies.dero.community.dto.PostImageResponse;
import com.brunchies.dero.community.dto.PostImageUploadUrlsRequest;
import com.brunchies.dero.community.dto.PostImageUploadUrlsResponse;
import com.brunchies.dero.community.dto.PostSaveRequest;
import com.brunchies.dero.community.dto.PostSummaryResponse;
import com.brunchies.dero.community.repository.PostCommentRepository;
import com.brunchies.dero.community.repository.PostRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.CommonErrorCode;
import com.brunchies.dero.global.response.CursorCodec;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.infra.PresignPort;
import com.brunchies.dero.infra.PublicImageUrlResolver;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 게시글 CRUD(REQ-COM-12, {@code api-spec.md} §6, ADR-0011·ADR-0013).
 *
 * <p><b>배치 참조는 본문 토큰이 전부다</b> — FK도 정션도 별도 엔드포인트도 없다. 대신 저장·수정
 * 시점에 본문의 {@code [[placement:ID]]}가 <b>본인 소유 + {@code PUBLIC}</b> 배치를 가리키는지
 * 검증하고, 아니면 400이다(ADR-0013 결정 3). <b>자동 공개도 공개 전환 유도도 하지 않는다.</b>
 *
 * <p><b>목록·상세는 비로그인도 200이다</b>(🔓). 게시글에는 배치 같은 게시 상태가 없어 가시성
 * 게이트가 "지워지지 않았는가" 하나뿐이다 — 신원으로 좁힐 범위가 없으므로 {@code userId}를 아예
 * 받지 않는다. 반대로 <b>수정·삭제는 작성자 본인만이고 403이다</b>(404가 아니다 — 본문이 이미
 * 공개돼 있어 존재를 숨길 것이 없다).
 *
 * <p>{@code placement}를 읽기 위해 {@code PlacementRepository}를 직접 주입한다 — ADR-0007 결정 2가
 * "읽기는 애그리거트 경계를 넘어도 된다"이고 의존 방향 {@code community → placement}가 맞다.
 * {@code CommentService}가 이미 같은 형태다.
 */
@Service
@Transactional(readOnly = true)
public class PostService {

	/** {@code ?owner=me} — 자기 자신은 항상 이 리터럴로 가리킨다(api-spec.md §3). */
	private static final String OWNER_ME = "me";

	private static final String WITHDRAWN_NICKNAME = "알 수 없음";

	/** ADR-0013 결정 8. 행 개수 조건이라 인덱스로 표현할 수 없어 WAS가 강제한다. */
	private static final int MAX_IMAGES = 20;

	private static final String IMAGE_KEY_PREFIX = "post-images/";

	/** presign key의 확장자를 정하는 표 — 여기 없는 MIME 타입은 400이다. */
	private static final Map<String, String> IMAGE_EXTENSIONS = Map.of(
			// 저장 포맷은 webp로 통일한다(ADR-0035 결정 4) — 변환은 프론트가 업로드 전에 한다.
			"image/webp", "webp");

	private final PostRepository posts;
	private final PostCommentRepository postComments;
	private final PlacementRepository placements;
	private final HashtagRepository hashtags;
	private final UserRepository users;
	private final PresignPort presignPort;
	private final PublicImageUrlResolver publicImageUrl;
	private final PostSearchService postSearchService;
	private final ApplicationEventPublisher events;

	/**
	 * DB 구간을 감싸는 짧은 읽기 트랜잭션. 검색 경로가 클래스 레벨 트랜잭션을 벗어야 해서
	 * ({@link #list} 참조) 그 자리를 대신 채운다.
	 *
	 * <p><b>자동 구성된 {@code TransactionTemplate} 빈을 주입하지 않고 직접 만든다</b> — 그 빈은
	 * 기본 전파에 <b>읽기 전용이 아니다</b>({@code ProductCatalogService}와 같은 조립). 손으로 쓴
	 * 생성자가 남아 있는 이유가 이것이다({@code enum-and-lombok.md} 규칙 2의 허용 사유).
	 */
	private final TransactionTemplate reads;

	public PostService(PostRepository posts, PostCommentRepository postComments,
			PlacementRepository placements, HashtagRepository hashtags, UserRepository users,
			PresignPort presignPort, PublicImageUrlResolver publicImageUrl,
			PostSearchService postSearchService,
			ApplicationEventPublisher events, PlatformTransactionManager transactionManager) {
		this.posts = posts;
		this.postComments = postComments;
		this.placements = placements;
		this.hashtags = hashtags;
		this.users = users;
		this.presignPort = presignPort;
		this.publicImageUrl = publicImageUrl;
		this.postSearchService = postSearchService;
		this.events = events;
		this.reads = new TransactionTemplate(transactionManager);
		this.reads.setReadOnly(true);
	}

	/**
	 * 최신순 커서 목록. <b>{@code q}가 있으면 검색 경로로 갈라진다</b>(ADR-0027) —
	 * {@code ?hashtag}·{@code ?owner} 필터는 그대로 같이 걸린다. {@code q}가 없으면 지금까지와 한 글자도
	 * 다르지 않다.
	 *
	 * <p><b>{@code SUPPORTS}이고 DB 구간만 {@link #reads}로 감싼다.</b> 검색 경로는 ES 왕복 뒤에 DB
	 * 조회가 오는데, 하나의 트랜잭션으로 묶으면 <b>ES가 답할 때까지 커넥션 하나를 문 채 기다린다</b>.
	 * 폴백이 없어(ADR-0019 결정 6) 그 지연이 그대로 커넥션 보유 시간이 되고, 마르는 것은 검색이 아니라
	 * 관계없는 API 전부다. 진짜 못은 {@link PostSearchService#searchIds} 쪽 {@code NEVER}다 —
	 * 트랜잭션 안에서 이 메서드를 부르면 거기서 터진다.
	 *
	 * <p>{@code resolveOwner}는 DB를 읽지 않아 트랜잭션 밖에서 푼다.
	 */
	@Transactional(propagation = Propagation.SUPPORTS)
	public CursorPage<PostSummaryResponse> list(
			Long viewerId, String hashtag, String owner, String q, String cursor, int size) {
		Long ownerId = resolveOwner(owner, viewerId);
		if (q == null || q.isBlank()) {
			return reads.execute(status -> listPage(hashtag, ownerId, cursor, size));
		}

		// 여기가 이 메서드에서 유일하게 오래 걸리는 구간이고, 그래서 트랜잭션 밖이다.
		List<Long> hitIds = postSearchService.searchIds(q);
		return reads.execute(status -> searchPage(hashtag, ownerId, hitIds, cursor, size));
	}

	/**
	 * 최신순 목록 — <b>{@code size + 1}을 읽어 다음 페이지 유무를 판단한다</b>. 별도 count 없이 알 수
	 * 있는 값이다({@code PlacementService.list}와 같은 형태).
	 */
	private CursorPage<PostSummaryResponse> listPage(
			String hashtag, Long ownerId, String cursor, int size) {
		List<Post> rows =
				posts.findPage(hashtag, ownerId, CursorCodec.decode(cursor), Limit.of(size + 1));

		boolean hasNext = rows.size() > size;
		List<Post> content = hasNext ? rows.subList(0, size) : rows;
		String nextCursor = hasNext ? CursorCodec.encode(content.getLast().getId()) : null;

		return new CursorPage<>(
				summariesOf(content), nextCursor, hasNext, posts.countPage(hashtag, ownerId));
	}

	/**
	 * 검색 경로 — <b>ES가 정하는 것은 어떤 글이 몇 번째로 관련 있는가뿐이다.</b> 소프트 삭제와
	 * 태그·작성자 필터는 Postgres가 판정하고, 그래서 검색 결과와 목록이 같은 술어를 공유한다
	 * (ADR-0019 결정 4).
	 *
	 * <p><b>커서에 담기는 값이 목록 경로와 다르다</b> — 최신순은 마지막 {@code id}지만 여기는
	 * <b>오프셋</b>이다. 관련도 순서에는 "이 id 다음"이라는 기준이 없다(점수가 같은 글이 흔하고,
	 * 재색인 후 순서가 통째로 바뀔 수도 있다). 커서는 프론트가 열어보지 않는 불투명 문자열이라
	 * ({@link CursorCodec}) 담는 내용이 갈려도 호출부는 영향받지 않는다.
	 *
	 * <p>{@code totalCount}는 매 페이지 채운다 — 목록 경로와 달리 세는 데 추가 쿼리가 들지 않는다.
	 */
	private CursorPage<PostSummaryResponse> searchPage(
			String hashtag, Long ownerId, List<Long> hitIds, String cursor, int size) {
		if (hitIds.isEmpty()) {
			return new CursorPage<>(List.of(), null, false, 0);
		}

		Map<Long, Post> byId = posts.findAllByIds(hitIds, hashtag, ownerId).stream()
				.collect(Collectors.toMap(Post::getId, found -> found));
		List<Post> visible = hitIds.stream().map(byId::get).filter(Objects::nonNull).toList();

		Long decoded = CursorCodec.decode(cursor);
		int offset = decoded == null ? 0 : Math.max(decoded.intValue(), 0);
		int from = Math.min(offset, visible.size());
		int to = Math.min(from + size, visible.size());
		boolean hasNext = to < visible.size();

		return new CursorPage<>(
				summariesOf(visible.subList(from, to)),
				hasNext ? CursorCodec.encode((long) to) : null,
				hasNext,
				visible.size());
	}

	private List<PostSummaryResponse> summariesOf(List<Post> content) {
		Map<Long, Long> commentCounts = commentCountsOf(content);
		return content.stream()
				.map(post -> summaryOf(post, commentCounts.getOrDefault(post.getId(), 0L)))
				.toList();
	}

	/** 상세 → 200. 비로그인도 본다. 지워진 글은 404다. */
	public PostDetailResponse get(Long postId) {
		return detailOf(existingDetail(postId));
	}

	/** 작성 → 201. 본문 토큰 검증을 통과해야 저장된다. */
	@Transactional
	public PostDetailResponse create(Long userId, PostSaveRequest request) {
		requireEmbeddablePlacements(userId, request.content());

		User author = users.getReferenceById(userId);
		Post post = posts.save(Post.create(author, request.title(), request.content()));
		post.replaceHashtags(resolveHashtags(request.hashtagsOrEmpty()));

		// 채번된 id를 지금 받아야 Location 헤더와 응답에 실을 수 있다.
		posts.flush();
		events.publishEvent(new PostChangedEvent(post.getId()));
		return detailOf(post);
	}

	/** 수정 → 200. <b>남의 글이면 403</b>이고, 제목·본문·태그를 통째로 교체한다. */
	@Transactional
	public PostDetailResponse update(Long userId, Long postId, PostSaveRequest request) {
		Post post = requireOwned(userId, postId);
		requireEmbeddablePlacements(userId, request.content());

		post.updateContent(request.title(), request.content());
		post.replaceHashtags(resolveHashtags(request.hashtagsOrEmpty()));
		posts.flush();
		events.publishEvent(new PostChangedEvent(postId));
		return detailOf(post);
	}

	/**
	 * 삭제 → 204. 소프트 삭제라 목록·상세 쿼리의 {@code deleted_at is null}이 걸러 낸다.
	 *
	 * <p><b>사진 파일은 안 지운다</b> — 소프트 삭제라 {@code post_image} 행이 그대로 남고, 오브젝트
	 * 정리 로직은 아직 없다(배치 썸네일과 같은 상태다).
	 */
	@Transactional
	public void delete(Long userId, Long postId) {
		requireOwned(userId, postId).softDelete();
		events.publishEvent(new PostChangedEvent(postId));
	}

	/**
	 * 사진 presign 1단계 — 올릴 장수만큼 presigned PUT URL을 발급한다. 저장하는 게 없어 200이다.
	 *
	 * <p><b>key는 글마다 폴더가 갈리고 파일명은 UUID다</b>({@code post-images/{postId}/{uuid}.{ext}}).
	 * 배치 썸네일처럼 결정론적으로 만들 수 없다 — 한 글에 최대 20장이라 같은 이름이면 서로 덮어쓴다.
	 * 대신 접두사가 글에 고정돼 2단계가 "이 글의 key인가"를 판정할 기준이 된다.
	 */
	@Transactional(readOnly = true)
	public PostImageUploadUrlsResponse presignImageUploads(
			Long userId, Long postId, PostImageUploadUrlsRequest request) {
		Post post = requireOwned(userId, postId);
		requireWithinImageLimit(post, request.contentTypes().size());

		List<PostImageUploadUrlsResponse.Item> items =
				new ArrayList<>(request.contentTypes().size());
		for (String contentType : request.contentTypes()) {
			String key = imageKeyOf(postId, contentType);
			items.add(new PostImageUploadUrlsResponse.Item(
					key, presignPort.presignUpload(key, contentType)));
		}
		return new PostImageUploadUrlsResponse(items);
	}

	/**
	 * 사진 presign 2단계 — 업로드가 끝난 key 등록 → 201.
	 *
	 * <p>이 글의 접두사가 아니면 400이다: key가 그대로 presigned GET URL의 입력이라, 아무 문자열이나
	 * 받으면 남의 파일 주소를 자기 글에 실을 수 있다.
	 */
	@Transactional
	public PostImageResponse registerImage(
			Long userId, Long postId, PostImageRegisterRequest request) {
		Post post = requireOwned(userId, postId);
		requireWithinImageLimit(post, 1);
		if (!request.imageKey().startsWith(imageKeyPrefixOf(postId))) {
			throw new BusinessException(CommunityErrorCode.POST_INVALID_IMAGE_KEY);
		}

		if (request.isPrimary()) {
			// 내리고 나서 flush를 한 번 끊는다 — 같은 flush에 두면 Hibernate가 INSERT를 UPDATE보다
			// 먼저 내서 부분 유니크가 새 행의 is_primary=true를 거부한다(500).
			post.demotePrimaryImages();
			posts.flush();
		}

		PostImage image = PostImage.create(post, request.imageKey(), request.isPrimary());
		post.addImage(image);
		// 채번된 post_image.id를 지금 받아야 응답에 실을 수 있다(save()는 부르지 않는다 — id 있는
		// 루트는 merge 경로를 타고 채번된 id가 복사본에 붙는다).
		posts.flush();
		return imageOf(image);
	}

	/** 사진 삭제 → 204. {@code orphanRemoval}이 DELETE를 낸다 — 오브젝트 파일은 남는다. */
	@Transactional
	public void deleteImage(Long userId, Long postId, Long imageId) {
		if (!requireOwned(userId, postId).removeImage(imageId)) {
			throw new BusinessException(CommunityErrorCode.POST_IMAGE_NOT_FOUND);
		}
	}

	private Post requireOwned(Long userId, Long postId) {
		Post post = existingDetail(postId);
		// 작성자가 탈퇴하면 user가 NULL이 된다 — NULL 비교에 맡기면 아무나 주인이 된다.
		if (post.getUser() == null || !post.getUser().getId().equals(userId)) {
			throw new BusinessException(CommunityErrorCode.POST_NOT_OWNED);
		}
		return post;
	}

	/** 상한 20장은 행 개수 조건이라 인덱스로 표현할 수 없다 — 여기가 유일한 강제 지점이다. */
	private void requireWithinImageLimit(Post post, int adding) {
		if (post.getImages().size() + adding > MAX_IMAGES) {
			throw new BusinessException(CommunityErrorCode.POST_IMAGE_LIMIT_EXCEEDED);
		}
	}

	private String imageKeyPrefixOf(Long postId) {
		return IMAGE_KEY_PREFIX + postId + "/";
	}

	private String imageKeyOf(Long postId, String contentType) {
		String extension = IMAGE_EXTENSIONS.get(contentType);
		if (extension == null) {
			throw new BusinessException(CommunityErrorCode.POST_UNSUPPORTED_IMAGE_TYPE);
		}
		return imageKeyPrefixOf(postId) + UUID.randomUUID() + "." + extension;
	}

	private PostDetailResponse detailOf(Post post) {
		return new PostDetailResponse(
				post.getId(),
				post.getTitle(),
				post.getContent(),
				hashtagNamesOf(post),
				post.getImages().stream().map(this::imageOf).toList(),
				post.getLikeCount(),
				commentCountOf(post.getId()),
				post.getUser() == null ? null : post.getUser().getId(),
				post.getUser() == null ? WITHDRAWN_NICKNAME : post.getUser().getNickname(),
				post.getUser() == null ? null : post.getUser().getProfileImageKey(),
				post.getCreatedAt(),
				post.getUpdatedAt());
	}

	private PostImageResponse imageOf(PostImage image) {
		return new PostImageResponse(image.getId(), image.getImageKey(),
				publicImageUrl.url(image.getImageKey()), image.isPrimary());
	}

	private Post existingDetail(Long postId) {
		return posts.findDetailById(postId)
				.orElseThrow(() -> new BusinessException(CommunityErrorCode.POST_NOT_FOUND));
	}

	/**
	 * 본문 토큰이 가리키는 배치가 전부 <b>본인 소유 + {@code PUBLIC}</b>인지 확인한다
	 * (ADR-0013 결정 3). 없는 배치·남의 배치·내 비공개 배치를 <b>한 코드로</b> 거부한다 — 갈라
	 * 놓으면 "그 id의 배치가 존재한다"를 흘린다.
	 */
	private void requireEmbeddablePlacements(Long userId, String content) {
		List<Long> referenced = PlacementEmbedTokens.extract(content);
		if (referenced.isEmpty()) {
			return;
		}
		Set<Long> embeddable = new HashSet<>(placements.findEmbeddableIds(referenced, userId));
		if (!embeddable.containsAll(referenced)) {
			throw new BusinessException(CommunityErrorCode.POST_PLACEMENT_NOT_EMBEDDABLE);
		}
	}

	/**
	 * 태그 이름을 마스터 행으로 바꾼다. <b>없으면 만든다</b> — 태그는 사용자가 자유롭게 쓰는 어휘라
	 * 관리자가 미리 등록해 둘 수 없고, 없는 이름을 400으로 막으면 지금 시드가 0건이라 아무 태그도
	 * 못 단다({@code hashtag} 마스터는 {@code product_hashtag}와 공유하므로 여기서 만든 행이
	 * 제품 태깅에도 그대로 보인다).
	 *
	 * <p>같은 이름이 여러 번 오면 첫 것만 남긴다 — {@code uq_post_hashtag_post_id_hashtag_id}가
	 * 어차피 거부한다.
	 */
	private List<Hashtag> resolveHashtags(List<String> names) {
		Set<String> unique = new LinkedHashSet<>();
		for (String name : names) {
			unique.add(name.strip());
		}

		List<Hashtag> resolved = new ArrayList<>(unique.size());
		for (String name : unique) {
			resolved.add(hashtags.findByNameAndDeletedAtIsNull(name)
					.orElseGet(() -> hashtags.save(Hashtag.create(name, null))));
		}
		return resolved;
	}

	private PostSummaryResponse summaryOf(Post post, long commentCount) {
		User author = post.getUser();
		return new PostSummaryResponse(
				post.getId(),
				post.getTitle(),
				post.getContent(),
				thumbnailUrlOf(post),
				post.getLikeCount(),
				commentCount,
				hashtagNamesOf(post),
				author == null ? null : author.getId(),
				author == null ? WITHDRAWN_NICKNAME : author.getNickname(),
				author == null ? null : author.getProfileImageKey(),
				post.getCreatedAt(),
				post.getUpdatedAt());
	}

	/** 목록 카드 표지는 {@code is_primary} 1장이다 — 없으면 표지 없는 카드다(ADR-0013 결정 5). */
	private String thumbnailUrlOf(Post post) {
		return post.getImages().stream()
				.filter(PostImage::isPrimary)
				.findFirst()
				.map(image -> publicImageUrl.url(image.getImageKey()))
				.orElse(null);
	}

	private List<String> hashtagNamesOf(Post post) {
		return post.getHashtags().stream()
				.map(PostHashtag::getHashtag)
				.map(Hashtag::getName)
				.toList();
	}

	/** 목록은 개수를 한 번에 센다 — 카드마다 count를 치면 N+1이다. */
	private Map<Long, Long> commentCountsOf(List<Post> content) {
		if (content.isEmpty()) {
			return Map.of();
		}
		List<Long> ids = content.stream().map(Post::getId).toList();
		return postComments.countByPostIds(ids).stream()
				.collect(Collectors.toMap(row -> (Long) row[0], row -> (Long) row[1]));
	}

	private long commentCountOf(Long postId) {
		return postComments.countByPostIds(List.of(postId)).stream()
				.findFirst()
				.map(row -> (Long) row[1])
				.orElse(0L);
	}

	/**
	 * {@code ?owner}를 작성자 id로 푼다. {@code me}는 호출자 자신이고 <b>비로그인이면 400이다</b> —
	 * NULL로 흘리면 소유자 조건이 통째로 빠져 "내 글"을 요청한 화면에 남의 글이 뜬다.
	 */
	private Long resolveOwner(String owner, Long viewerId) {
		if (owner == null || owner.isBlank()) {
			return null;
		}
		if (OWNER_ME.equals(owner)) {
			if (viewerId == null) {
				throw new BusinessException(CommonErrorCode.INVALID_INPUT);
			}
			return viewerId;
		}
		try {
			return Long.valueOf(owner);
		} catch (NumberFormatException e) {
			// me도 숫자도 아닌 owner — 400으로 번역한다(규칙 8).
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
	}
}
