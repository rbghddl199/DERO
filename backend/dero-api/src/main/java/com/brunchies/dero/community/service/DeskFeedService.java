package com.brunchies.dero.community.service;

import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.catalog.repository.HashtagRepository;
import com.brunchies.dero.community.CommunityErrorCode;
import com.brunchies.dero.community.DeskFeed;
import com.brunchies.dero.community.DeskFeedContentImages;
import com.brunchies.dero.community.DeskFeedHashtag;
import com.brunchies.dero.community.DeskFeedImage;
import com.brunchies.dero.community.DeskFeedImageProduct;
import com.brunchies.dero.community.DeskFeedProduct;
import com.brunchies.dero.community.DeskFeedSort;
import com.brunchies.dero.community.dto.DeskFeedCreateRequest;
import com.brunchies.dero.community.dto.DeskFeedDetailResponse;
import com.brunchies.dero.community.dto.DeskFeedImageRegisterRequest;
import com.brunchies.dero.community.dto.DeskFeedImageResponse;
import com.brunchies.dero.community.dto.DeskFeedImageUploadUrlsRequest;
import com.brunchies.dero.community.dto.DeskFeedImageUploadUrlsResponse;
import com.brunchies.dero.community.dto.DeskFeedPlacementSummaryResponse;
import com.brunchies.dero.community.dto.DeskFeedProductSummaryResponse;
import com.brunchies.dero.community.dto.DeskFeedSummaryResponse;
import com.brunchies.dero.community.dto.DeskFeedUpdateRequest;
import com.brunchies.dero.community.repository.DeskFeedCommentRepository;
import com.brunchies.dero.community.repository.DeskFeedRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.CommonErrorCode;
import com.brunchies.dero.global.response.CursorCodec;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.infra.PresignPort;
import com.brunchies.dero.infra.PublicImageUrlResolver;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PublishStatus;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.ProductImage;
import com.brunchies.dero.product.repository.ProductRepository;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 데스크피드 CRUD(REQ-COM-16·17, api-spec.md §6-보, D32·ADR-0033).
 *
 * <p><b>배치 참조는 단일 nullable FK다</b> — {@code PostService}의 본문 토큰과 반대 결정이고
 * (ADR-0033 결정 3), 첨부 자격은 같은 규칙(본인 소유 + {@code PUBLIC}, D25)을
 * {@link PlacementRepository#findEmbeddableIds}로 <b>같은 쿼리</b>로 검증한다. 위반은 400이 아니라
 * <b>422</b>다(api-spec.md §6-보 명시).
 *
 * <p><b>목록·상세는 비로그인도 200이다</b>(🔓) — 게시 상태가 없어 가시성 게이트가 "지워지지
 * 않았는가" 하나뿐이다({@code PostService}와 같은 자리). 수정·삭제는 작성자 본인만 403이다.
 *
 * <p>{@code PlacementRepository}를 직접 읽는 것은 ADR-0007 결정 2(읽기는 경계를 넘어도 된다)이고
 * 의존 방향 {@code community → placement}가 맞다.
 */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class DeskFeedService {

	/** {@code ?owner=me} — 자기 자신은 항상 이 리터럴로 가리킨다(api-spec.md §3). */
	private static final String OWNER_ME = "me";

	private static final String WITHDRAWN_NICKNAME = "알 수 없음";

	private static final String IMAGE_KEY_PREFIX = "desk-feed-images/";

	/** presign key의 확장자를 정하는 표 — 여기 없는 MIME 타입은 400이다({@code PostService}와 동형). */
	private static final Map<String, String> IMAGE_EXTENSIONS = Map.of(
			// 저장 포맷은 webp로 통일한다(ADR-0035 결정 4) — 변환은 프론트가 업로드 전에 한다.
			"image/webp", "webp");

	private final DeskFeedRepository deskFeeds;
	private final DeskFeedCommentRepository deskFeedComments;
	private final MentionService mentionService;
	private final PlacementRepository placements;
	private final HashtagRepository hashtags;
	private final ProductRepository products;
	private final UserRepository users;
	private final PresignPort presignPort;
	private final PublicImageUrlResolver publicImageUrl;

	/**
	 * 커서 목록 — {@code size + 1}을 읽어 다음 페이지 유무를 판단한다. 커서는 정렬 축이 둘이라
	 * {@code (정렬키값, id)} 복합이다({@code PlacementService}와 같은 형태). 검색({@code ?q=})은
	 * 없다 — ES 색인은 후속이다(ADR-0033 결정 6).
	 */
	public CursorPage<DeskFeedSummaryResponse> list(Long viewerId, String hashtag, String owner,
			Long placementId, String sortValue, String cursor, int size) {
		Long ownerId = resolveOwner(owner, viewerId);
		DeskFeedSort sort = DeskFeedSort.from(sortValue);

		List<DeskFeed> rows = deskFeeds.findPage(hashtag, ownerId, placementId, sort,
				CursorCodec.decodeComposite(cursor), Limit.of(size + 1));
		boolean hasNext = rows.size() > size;
		List<DeskFeed> content = hasNext ? rows.subList(0, size) : rows;
		DeskFeed last = content.isEmpty() ? null : content.getLast();
		String nextCursor = hasNext
				? CursorCodec.encode(sort.cursorValueOf(last), last.getId())
				: null;

		return new CursorPage<>(summariesOf(content), nextCursor, hasNext,
				deskFeeds.countPage(hashtag, ownerId, placementId));
	}

	/**
	 * 상세 → 200. 비로그인도 본다. 지워진 글은 404다.
	 *
	 * <p><b>사진 0장 글은 작성자 본인 외 404다</b> — 목록의 노출 게이트(사진 1장 이상,
	 * {@code DeskFeedRepositoryImpl.hasImage})와 같은 규칙이고, 작성자만 예외인 이유는 작성 →
	 * 업로드 2단계 사이에 본인이 이어서 등록할 수 있어야 하기 때문이다. 남에게는 존재를 흘리지
	 * 않는다(403이 아니라 404).
	 */
	public DeskFeedDetailResponse get(Long viewerId, Long deskFeedId) {
		DeskFeed deskFeed = existingDetail(deskFeedId);
		if (deskFeed.getImages().isEmpty() && !isOwner(deskFeed, viewerId)) {
			throw new BusinessException(CommunityErrorCode.DESK_FEED_NOT_FOUND);
		}
		return detailOf(deskFeed);
	}

	/**
	 * 작성 → 201. <b>사진은 여기 없다</b> — presign 2단계가 작성 후 등록한다({@code PostService}와
	 * 같은 자리). 최소 1장은 업로드 시퀀스상 이 시점에 강제할 수 없어 <b>노출 게이트</b>(0장 글은
	 * 목록 제외·상세 작성자 전용)가 강제한다.
	 */
	@Transactional
	public DeskFeedDetailResponse create(Long userId, DeskFeedCreateRequest request) {
		requireInlineImageCount(request.content());
		Placement attached = requireAttachablePlacement(userId, request.placementId());

		User author = users.getReferenceById(userId);
		DeskFeed deskFeed = deskFeeds.save(
				DeskFeed.create(author, attached, request.title(), request.content()));
		deskFeed.replaceHashtags(resolveHashtags(request.hashtagsOrEmpty()));
		deskFeed.replaceProducts(requireTaggableProducts(request.productIdsOrEmpty()));

		// 채번된 id를 지금 받아야 Location 헤더와 응답에 실을 수 있다.
		deskFeeds.flush();
		return detailOf(deskFeed);
	}

	/**
	 * 수정 → 200. <b>제목·본문·태그·사용 제품·배치 첨부/해제의 전체 교체다</b>.
	 * {@code placementId = null}은 "안 건드림"이 아니라 <b>해제</b>다.
	 *
	 * <p><b>사진은 여기서 건드리지 않는다</b>({@code PostService.update}와 동형, D34·ADR-0037) —
	 * 등록·삭제 엔드포인트가 레지스트리를 관리하고 순서는 본문 안 {@code ![alt](key)} 위치가 정본이다.
	 */
	@Transactional
	public DeskFeedDetailResponse update(Long userId, Long deskFeedId,
			DeskFeedUpdateRequest request) {
		requireInlineImageCount(request.content());
		DeskFeed deskFeed = requireOwned(userId, deskFeedId);
		Placement attached = requireAttachablePlacement(userId, request.placementId());

		deskFeed.updateContent(request.title(), request.content());
		deskFeed.changePlacement(attached);
		deskFeed.replaceHashtags(resolveHashtags(request.hashtagsOrEmpty()));
		deskFeed.replaceProducts(requireTaggableProducts(request.productIdsOrEmpty()));
		deskFeeds.flush();
		return detailOf(deskFeed);
	}

	/**
	 * 삭제 → 204. 소프트 삭제라 목록·상세 쿼리의 {@code deleted_at is null}이 걸러 낸다. 사진
	 * 파일은 안 지운다 — {@code desk_feed_image} 행이 그대로 남고 오브젝트 정리 로직은 아직 없다
	 * ({@code PostService.delete}와 같은 상태).
	 */
	@Transactional
	public void delete(Long userId, Long deskFeedId) {
		requireOwned(userId, deskFeedId).softDelete();
	}

	/**
	 * 사진 presign 1단계 — 올릴 장수만큼 presigned PUT URL 발급. 저장하는 게 없어 200이다.
	 * key는 글마다 폴더가 갈리고 파일명은 UUID다({@code desk-feed-images/{id}/{uuid}.{ext}}) —
	 * 접두사가 글에 고정돼 2단계가 "이 글의 key인가"를 판정할 기준이 된다({@code PostService}와
	 * 같은 조립).
	 */
	public DeskFeedImageUploadUrlsResponse presignImageUploads(Long userId, Long deskFeedId,
			DeskFeedImageUploadUrlsRequest request) {
		DeskFeed deskFeed = requireOwned(userId, deskFeedId);
		requireWithinImageLimit(deskFeed, request.contentTypes().size());

		List<DeskFeedImageUploadUrlsResponse.Item> items =
				new ArrayList<>(request.contentTypes().size());
		for (String contentType : request.contentTypes()) {
			String key = imageKeyOf(deskFeedId, contentType);
			items.add(new DeskFeedImageUploadUrlsResponse.Item(
					key, presignPort.presignUpload(key, contentType)));
		}
		return new DeskFeedImageUploadUrlsResponse(items);
	}

	/**
	 * 사진 presign 2단계 — 업로드가 끝난 key 등록 → 201. 이 글의 접두사가 아니면 400이다 — key가
	 * 그대로 presigned GET URL의 입력이라 아무 문자열이나 받으면 남의 파일 주소를 자기 글에 실을 수
	 * 있다.
	 */
	@Transactional
	public DeskFeedImageResponse registerImage(Long userId, Long deskFeedId,
			DeskFeedImageRegisterRequest request) {
		DeskFeed deskFeed = requireOwned(userId, deskFeedId);
		requireWithinImageLimit(deskFeed, 1);
		requireOwnKeys(deskFeedId, List.of(request.imageKey()));

		DeskFeedImage image = DeskFeedImage.create(deskFeed, request.imageKey());
		deskFeed.addImage(image);
		// 채번된 id를 지금 받아야 응답에 실을 수 있다(save()는 부르지 않는다 — id 있는 루트는
		// merge 경로를 탄다).
		deskFeeds.flush();
		return imageOf(image);
	}

	/** 사진 삭제 → 204. {@code orphanRemoval}이 DELETE를 낸다 — 오브젝트 파일은 남는다. */
	@Transactional
	public void deleteImage(Long userId, Long deskFeedId, Long imageId) {
		if (!requireOwned(userId, deskFeedId).removeImage(imageId)) {
			throw new BusinessException(CommunityErrorCode.DESK_FEED_IMAGE_NOT_FOUND);
		}
	}

	/**
	 * 사진 한 장의 제품 태그를 <b>통째로 교체</b>한다(D37 개정·ADR-0040) — 빈 목록이 "태그 없음"이고
	 * 수정 {@code PUT}의 전체 교체 의미론과 같은 결이다.
	 *
	 * <p><b>글 단위 목록의 부분집합만 허용한다</b> — 글에 붙지 않은 제품을 사진에만 달면 상세 화면이
	 * 이름·가격을 못 찾는다(응답이 id만 싣는다). 글 목록 밖 제품은 422 한 코드로 거부한다.
	 */
	@Transactional
	public DeskFeedImageResponse replaceImageProducts(Long userId, Long deskFeedId, Long imageId,
			List<Long> productIds) {
		DeskFeed deskFeed = requireOwned(userId, deskFeedId);
		DeskFeedImage image = deskFeed.getImages().stream()
				.filter(candidate -> candidate.getId().equals(imageId))
				.findFirst()
				.orElseThrow(() -> new BusinessException(
						CommunityErrorCode.DESK_FEED_IMAGE_NOT_FOUND));

		List<Long> unique = List.copyOf(new LinkedHashSet<>(productIds));
		Map<Long, Product> taggableByProductId = deskFeed.getProducts().stream()
				.map(DeskFeedProduct::getProduct)
				.filter(product -> product.getDeletedAt() == null)
				.collect(Collectors.toMap(Product::getId, product -> product));
		if (!taggableByProductId.keySet().containsAll(unique)) {
			throw new BusinessException(CommunityErrorCode.DESK_FEED_PRODUCT_NOT_TAGGABLE);
		}

		image.replaceProducts(unique.stream().map(taggableByProductId::get).toList());
		deskFeeds.flush();
		return imageOf(image);
	}

	private DeskFeed requireOwned(Long userId, Long deskFeedId) {
		DeskFeed deskFeed = existingDetail(deskFeedId);
		if (!isOwner(deskFeed, userId)) {
			throw new BusinessException(CommunityErrorCode.DESK_FEED_NOT_OWNED);
		}
		return deskFeed;
	}

	/** 작성자가 탈퇴하면 user가 NULL이 된다 — NULL 비교에 맡기면 아무나 주인이 된다. */
	private boolean isOwner(DeskFeed deskFeed, Long userId) {
		return deskFeed.getUser() != null && deskFeed.getUser().getId().equals(userId);
	}

	private DeskFeed existingDetail(Long deskFeedId) {
		return deskFeeds.findDetailById(deskFeedId)
				.orElseThrow(() -> new BusinessException(CommunityErrorCode.DESK_FEED_NOT_FOUND));
	}

	/**
	 * 첨부 배치가 <b>본인 소유 + {@code PUBLIC}</b>인지 확인하고 참조를 돌려준다(ADR-0033 결정 3,
	 * D25). 없는 배치·남의 배치·내 비공개 배치를 <b>한 코드(422)로</b> 거부한다 — 갈라 놓으면 "그
	 * id의 배치가 존재한다"를 흘린다. {@code post} 본문 토큰과 같은 술어를
	 * {@link PlacementRepository#findEmbeddableIds}로 공유한다.
	 */
	private Placement requireAttachablePlacement(Long userId, Long placementId) {
		if (placementId == null) {
			return null;
		}
		if (placements.findEmbeddableIds(List.of(placementId), userId).isEmpty()) {
			throw new BusinessException(CommunityErrorCode.DESK_FEED_PLACEMENT_NOT_ATTACHABLE);
		}
		return placements.getReferenceById(placementId);
	}

	/**
	 * "사용된 제품" 태그가 전부 <b>존재하고 소프트 삭제되지 않은 제품</b>인지 확인하고 참조를
	 * 돌려준다(ADR-0034 결정 5). 없는 제품·지워진 제품을 <b>한 코드(422)로</b> 거부한다 — 갈라
	 * 놓으면 "그 id의 제품이 존재한다"를 흘린다({@link #requireAttachablePlacement}와 같은 패턴).
	 *
	 * <p>같은 id가 여러 번 오면 첫 것만 남긴다 — 정션 유니크가 어차피 거부한다
	 * ({@link #resolveHashtags}와 같은 판단). 상한 10개는 요청 DTO의 {@code @Size}가 자른다.
	 */
	private List<Product> requireTaggableProducts(List<Long> productIds) {
		List<Long> unique = List.copyOf(new LinkedHashSet<>(productIds));
		if (unique.isEmpty()) {
			return List.of();
		}

		List<Product> found = products.findAllByIdInAndDeletedAtIsNull(unique);
		if (found.size() != unique.size()) {
			throw new BusinessException(CommunityErrorCode.DESK_FEED_PRODUCT_NOT_TAGGABLE);
		}
		return found;
	}

	/** 상한 30장은 행 개수 조건이라 여기가 유일한 강제 지점이다(erd.md desk_feed_image 절). */
	private void requireWithinImageLimit(DeskFeed deskFeed, int adding) {
		if (deskFeed.getImages().size() + adding > DeskFeed.MAX_IMAGES) {
			throw new BusinessException(CommunityErrorCode.DESK_FEED_IMAGE_LIMIT_EXCEEDED);
		}
	}

	private void requireOwnKeys(Long deskFeedId, List<String> imageKeys) {
		String prefix = imageKeyPrefixOf(deskFeedId);
		for (String imageKey : imageKeys) {
			if (!imageKey.startsWith(prefix)) {
				throw new BusinessException(CommunityErrorCode.DESK_FEED_INVALID_IMAGE_KEY);
			}
		}
	}

	/**
	 * 본문 안 인라인 이미지가 1~30장인지 본다(D34·ADR-0037 결정 1, 상한은 2026-08-11 30장으로 상향). <b>최소 1장이 여기서 서는 것은
	 * 작성·수정 요청 기준이고</b>, 레지스트리가 아직 비어 있는 작성 직후 상태는 노출 게이트가
	 * 계속 맡는다(작성 시점의 본문은 브라우저 미리보기 주소를 물고 있어 key가 아직 없다).
	 *
	 * <p>상한이 {@link #requireWithinImageLimit}와 두 곳인 이유는 세는 대상이 달라서다 — 저쪽은
	 * 레지스트리 행 수, 이쪽은 본문 토큰 수이고 사용자가 어기는 쪽은 본문이다.
	 */
	private void requireInlineImageCount(String content) {
		int count = DeskFeedContentImages.extract(content).size();
		if (count < 1 || count > DeskFeed.MAX_IMAGES) {
			throw new BusinessException(CommunityErrorCode.DESK_FEED_CONTENT_IMAGE_COUNT_INVALID);
		}
	}

	private String imageKeyPrefixOf(Long deskFeedId) {
		return IMAGE_KEY_PREFIX + deskFeedId + "/";
	}

	private String imageKeyOf(Long deskFeedId, String contentType) {
		String extension = IMAGE_EXTENSIONS.get(contentType);
		if (extension == null) {
			throw new BusinessException(CommunityErrorCode.DESK_FEED_UNSUPPORTED_IMAGE_TYPE);
		}
		return imageKeyPrefixOf(deskFeedId) + UUID.randomUUID() + "." + extension;
	}

	private List<DeskFeedSummaryResponse> summariesOf(List<DeskFeed> content) {
		Map<Long, Long> commentCounts = commentCountsOf(content);
		// 멘션 닉네임도 한 번에 읽는다 — 카드마다 풀면 페이지당 20번 조회다.
		Map<Long, String> nicknames =
				mentionService.nicknamesIn(content.stream().map(DeskFeed::getContent).toList());
		return content.stream()
				.map(deskFeed -> summaryOf(deskFeed,
						commentCounts.getOrDefault(deskFeed.getId(), 0L), nicknames))
				.toList();
	}

	private DeskFeedSummaryResponse summaryOf(DeskFeed deskFeed, long commentCount,
			Map<Long, String> nicknames) {
		User author = deskFeed.getUser();
		return new DeskFeedSummaryResponse(
				deskFeed.getId(),
				deskFeed.getTitle(),
				deskFeed.getContent(),
				mentionService.mentionsOf(deskFeed.getContent(), nicknames),
				coverUrlOf(deskFeed),
				deskFeed.getImages().size(),
				deskFeed.getLikeCount(),
				commentCount,
				hashtagNamesOf(deskFeed),
				attachedPlacementIdOf(deskFeed),
				author == null ? null : author.getId(),
				author == null ? WITHDRAWN_NICKNAME : author.getNickname(),
				author == null ? null : author.getProfileImageKey(),
				deskFeed.getCreatedAt(),
				deskFeed.getUpdatedAt());
	}

	private DeskFeedDetailResponse detailOf(DeskFeed deskFeed) {
		User author = deskFeed.getUser();
		return new DeskFeedDetailResponse(
				deskFeed.getId(),
				deskFeed.getTitle(),
				deskFeed.getContent(),
				mentionService.resolve(deskFeed.getContent()),
				hashtagNamesOf(deskFeed),
				deskFeed.getImages().stream().map(this::imageOf).toList(),
				deskFeed.getLikeCount(),
				commentCountOf(deskFeed.getId()),
				attachedPlacementIdOf(deskFeed),
				placementSummaryOf(deskFeed),
				usedProductsOf(deskFeed),
				author == null ? null : author.getId(),
				author == null ? WITHDRAWN_NICKNAME : author.getNickname(),
				author == null ? null : author.getProfileImageKey(),
				deskFeed.getCreatedAt(),
				deskFeed.getUpdatedAt());
	}

	/** FK 원시값 — 프록시의 id 접근이라 배치 행을 로드하지 않는다. */
	private Long attachedPlacementIdOf(DeskFeed deskFeed) {
		return deskFeed.getPlacement() == null ? null : deskFeed.getPlacement().getId();
	}

	/**
	 * 첨부 배치 요약 카드 — <b>배치가 {@code PUBLIC}일 때만</b> 싣는다(ADR-0033 결정 5). 공개취소·
	 * 소프트 삭제면 FK는 그대로 두고 여기만 {@code null}이다(화면이 카드를 숨긴다). 역방향
	 * ({@code ?placementId})은 컬렉션 상세 자체가 PUBLIC 전용이라 추가 처리 없이 성립한다.
	 */
	private DeskFeedPlacementSummaryResponse placementSummaryOf(DeskFeed deskFeed) {
		Placement placement = deskFeed.getPlacement();
		if (placement == null || placement.getDeletedAt() != null
				|| placement.getPublishStatus() != PublishStatus.PUBLIC) {
			return null;
		}
		return new DeskFeedPlacementSummaryResponse(
				placement.getId(),
				placement.getTitle(),
				placement.getThumbnailKey() == null
						? null
						: publicImageUrl.url(placement.getThumbnailKey()));
	}

	/**
	 * 상세 하단 "사용된 제품" 카드 목록(ADR-0034 결정 5). <b>소프트 삭제된 제품은 뺀다</b> — 정션
	 * 행은 남기고 화면만 숨긴다(첨부 배치 카드와 같은 규칙).
	 *
	 * <p>대표 이미지는 <b>id 목록으로 한 번에</b> 읽는다 — 카드마다 컬렉션을 걸면 N+1이고, 그래서
	 * {@code product.images}를 걷지 않고 {@code findPrimaryImagesByProductIdIn}을 쓴다
	 * ({@code CartItemService}와 같은 조립).
	 */
	private List<DeskFeedProductSummaryResponse> usedProductsOf(DeskFeed deskFeed) {
		List<Product> alive = deskFeed.getProducts().stream()
				.map(DeskFeedProduct::getProduct)
				.filter(product -> product.getDeletedAt() == null)
				.toList();
		if (alive.isEmpty()) {
			return List.of();
		}

		Map<Long, String> imageKeyByProductId =
				products.findPrimaryImagesByProductIdIn(alive.stream().map(Product::getId).toList())
						.stream()
						.collect(Collectors.toMap(
								image -> image.getProduct().getId(), ProductImage::getImageKey));
		return alive.stream()
				.map(product -> new DeskFeedProductSummaryResponse(
						product.getId(),
						product.getName(),
						product.getPriceKrw(),
						publicImageUrlOrNull(imageKeyByProductId.get(product.getId()))))
				.toList();
	}

	private String publicImageUrlOrNull(String imageKey) {
		return imageKey == null ? null : publicImageUrl.url(imageKey);
	}

	/**
	 * 목록 카드 표지는 <b>본문 첫 인라인 이미지</b>다(D34·ADR-0037 — 대표 컬럼이 없다).
	 *
	 * <p><b>레지스트리에 등록된 key만 표지가 된다</b> — 작성 직후의 본문은 아직 브라우저 미리보기
	 * 주소({@code blob:})를 물고 있어서, 걸러 내지 않으면 남의 브라우저에서만 열리는 주소가 카드에
	 * 실린다. 등록 전이면 표지 없는 카드다.
	 */
	private String coverUrlOf(DeskFeed deskFeed) {
		Set<String> registered = deskFeed.getImages().stream()
				.map(DeskFeedImage::getImageKey)
				.collect(Collectors.toSet());
		return DeskFeedContentImages.extract(deskFeed.getContent()).stream()
				.filter(registered::contains)
				.findFirst()
				.map(publicImageUrl::url)
				.orElse(null);
	}

	/**
	 * 사진 한 줄. {@code productIds}는 <b>살아 있는 제품만</b> 싣는다 — 소프트 삭제된 제품은 글 단위
	 * {@code usedProducts}에서도 빠지므로, 여기 남겨 두면 화면이 해석 못 하는 id가 생긴다.
	 */
	private DeskFeedImageResponse imageOf(DeskFeedImage image) {
		return new DeskFeedImageResponse(image.getId(), image.getImageKey(),
				publicImageUrl.url(image.getImageKey()),
				image.getProducts().stream()
						.map(DeskFeedImageProduct::getProduct)
						.filter(product -> product.getDeletedAt() == null)
						.map(Product::getId)
						.toList());
	}

	private List<String> hashtagNamesOf(DeskFeed deskFeed) {
		return deskFeed.getHashtags().stream()
				.map(DeskFeedHashtag::getHashtag)
				.map(Hashtag::getName)
				.toList();
	}

	/** 태그 이름을 마스터 행으로 바꾼다 — 없으면 만든다({@code PostService.resolveHashtags}와 같은 사유). */
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

	/** 목록은 개수를 한 번에 센다 — 카드마다 count를 치면 N+1이다. */
	private Map<Long, Long> commentCountsOf(List<DeskFeed> content) {
		if (content.isEmpty()) {
			return Map.of();
		}
		List<Long> ids = content.stream().map(DeskFeed::getId).toList();
		return deskFeedComments.countByDeskFeedIds(ids).stream()
				.collect(Collectors.toMap(row -> (Long) row[0], row -> (Long) row[1]));
	}

	private long commentCountOf(Long deskFeedId) {
		return deskFeedComments.countByDeskFeed_IdAndDeletedAtIsNull(deskFeedId);
	}

	/**
	 * {@code ?owner}를 작성자 id로 푼다. {@code me}는 호출자 자신이고 <b>비로그인이면 400이다</b> —
	 * NULL로 흘리면 소유자 조건이 통째로 빠진다({@code PostService.resolveOwner}와 동형).
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
