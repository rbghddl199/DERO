package com.brunchies.dero.placement.service;

import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.CommonErrorCode;
import com.brunchies.dero.global.response.CursorCodec;
import com.brunchies.dero.global.response.CursorPage;
import com.brunchies.dero.infra.PresignPort;
import com.brunchies.dero.infra.PublicImageUrlResolver;
import com.brunchies.dero.placement.PlacedItem;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.PlacementChangedEvent;
import com.brunchies.dero.placement.PlacementDesk;
import com.brunchies.dero.placement.PlacementErrorCode;
import com.brunchies.dero.placement.PlacementHashtag;
import com.brunchies.dero.placement.PlacementSort;
import com.brunchies.dero.placement.PublishStatus;
import com.brunchies.dero.placement.SpecSource;
import com.brunchies.dero.placement.PlacementWall;
import com.brunchies.dero.placement.dto.DeskDetailResponse;
import com.brunchies.dero.placement.dto.DeskSnapshot;
import com.brunchies.dero.placement.dto.FloorResponse;
import com.brunchies.dero.placement.dto.ItemDetailResponse;
import com.brunchies.dero.placement.dto.ItemRefMapping;
import com.brunchies.dero.placement.dto.ItemSnapshot;
import com.brunchies.dero.placement.dto.PlacementDetailResponse;
import com.brunchies.dero.placement.dto.PlacementSaveResponse;
import com.brunchies.dero.placement.dto.PlacementSnapshotRequest;
import com.brunchies.dero.placement.dto.PlacementSummaryResponse;
import com.brunchies.dero.placement.dto.RemixSourceResponse;
import com.brunchies.dero.placement.dto.ThumbnailRegisterRequest;
import com.brunchies.dero.placement.dto.ThumbnailUploadUrlResponse;
import com.brunchies.dero.placement.dto.ViolationResponse;
import com.brunchies.dero.placement.dto.WallDetailResponse;
import com.brunchies.dero.placement.dto.WallSnapshot;
import com.brunchies.dero.placement.judgment.JudgmentResult;
import com.brunchies.dero.placement.judgment.PlacementJudge;
import com.brunchies.dero.placement.repository.PlacementRepository;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.FrameType;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.product.repository.ProductRepository;
import com.brunchies.dero.user.User;
import com.brunchies.dero.user.repository.UserRepository;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.hibernate.Hibernate;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 배치 저장·상세·삭제·썸네일(REQ-SIM-06, ADR-0009).
 *
 * <p><b>저장은 씬 전체 스냅샷의 id 매칭 병합이다</b> — 통째 교체가 아니라 기존 행을 제자리에서 고치고
 * 안 온 id만 지운다. 그래야 {@code placed_item.id}가 저장마다 바뀌지 않는다.
 *
 * <p><b>규격 위반이 있어도 저장은 성공한다</b>(ADR-0009 결정 5) — 아직 고르는 중인 작업을 잃게 하지
 * 않기 위해서다. 게이트는 공개({@code PUT /placements/{id}/feed-entry})에 걸린다.
 */
@Service
@Transactional(readOnly = true)
public class PlacementService {

	private static final String THUMBNAIL_KEY_PREFIX = "placement-thumbnails/";
	// 캔버스 캡처도 webp로 통일한다(ADR-0035 결정 4) — 변환은 프론트가 캡처 시점에 한다.
	private static final String THUMBNAIL_KEY_SUFFIX = ".webp";
	private static final String THUMBNAIL_CONTENT_TYPE = "image/webp";

	/** {@code ?owner=me} — 자기 자신은 항상 이 리터럴로 가리킨다(api-spec.md §3). */
	private static final String OWNER_ME = "me";

	/** {@code ?bookmarked=me} — 같은 리터럴 규약이다. 다른 값은 없다(남의 북마크는 안 보인다). */
	private static final String BOOKMARKED_ME = "me";

	/** {@code ?bookmarkGroup=none} — "그룹 미지정만". 숫자 하나로는 미지정과 미필터를 못 가른다. */
	private static final String UNGROUPED_BOOKMARK = "none";

	private final PlacementRepository placements;
	private final ProductRepository products;
	private final DeskTextureRepository deskTextures;
	private final UserRepository users;
	private final PresignPort presignPort;
	private final PublicImageUrlResolver publicImageUrl;
	private final PlacementSearchService placementSearchService;
	// 목록 카드의 실제 데스크 값. 합계 규칙을 여기 옮겨 적지 않는다 — 카드와 견적 상세가 갈린다.
	private final PlacementEstimateService placementEstimateService;
	private final ApplicationEventPublisher events;

	/**
	 * DB 구간을 감싸는 짧은 읽기 트랜잭션. 검색 경로가 클래스 레벨 트랜잭션을 벗어야 해서
	 * ({@link #list} 참조) 그 자리를 대신 채운다.
	 *
	 * <p><b>자동 구성된 {@code TransactionTemplate} 빈을 주입하지 않고 직접 만든다</b> — 그 빈은
	 * 기본 전파에 <b>읽기 전용이 아니다</b>({@code PostService}와 같은 조립). 손으로 쓴 생성자가
	 * 남아 있는 이유가 이것이다({@code enum-and-lombok.md} 규칙 2의 허용 사유).
	 */
	private final TransactionTemplate reads;

	public PlacementService(PlacementRepository placements, ProductRepository products,
			DeskTextureRepository deskTextures, UserRepository users, PresignPort presignPort,
			PublicImageUrlResolver publicImageUrl,
			PlacementSearchService placementSearchService,
			PlacementEstimateService placementEstimateService, ApplicationEventPublisher events,
			PlatformTransactionManager transactionManager) {
		this.placements = placements;
		this.products = products;
		this.deskTextures = deskTextures;
		this.users = users;
		this.presignPort = presignPort;
		this.publicImageUrl = publicImageUrl;
		this.placementSearchService = placementSearchService;
		this.placementEstimateService = placementEstimateService;
		this.events = events;
		this.reads = new TransactionTemplate(transactionManager);
		this.reads.setReadOnly(true);
	}

	/**
	 * 신규 저장 → 201. {@code version}은 무시한다 — 비교할 현재 버전이 없다.
	 *
	 * <p>{@code save()}를 병합 <b>전에</b> 부른다. 그래야 루트가 영속 상태가 되고, 이어서 컬렉션에
	 * 넣는 책상·아이템은 {@code cascade = ALL}로 persist된다.
	 */
	@Transactional
	public PlacementSaveResponse create(Long userId, PlacementSnapshotRequest request) {
		Placement placement = Placement.create(users.getReferenceById(userId), request.title(),
				request.description(), request.budgetKrw());
		placements.save(placement);
		return applySnapshot(placement, request);
	}

	/**
	 * 기존 저장 → 200. <b>버전이 어긋나면 아무것도 쓰지 않고 409다</b> — 병합을 시작하기 전에 막는다.
	 * {@code version}이 NULL이어도 409다: 버전 없이 보내는 요청을 통과시키면 낙관적 락이 그 클라이언트
	 * 하나 때문에 통째로 무력해진다.
	 *
	 * <p><b>버전 비교와 증가는 벌크 UPDATE 한 문장이다</b>({@code advanceVersion}) — 읽고 나서 비교하면
	 * 그 사이가 열리고, {@code @Lock}의 강제 증가는 커밋 시점이라 응답에 실을 값이 아직 없다. 자세한
	 * 사유는 그 메서드의 Javadoc. <b>증가 폭에 기대는 코드를 쓰지 마라</b> — 배치 행 자체도 바뀌면
	 * 여기서 1, flush에서 1이 더 올라 2가 오른다. 클라이언트는 응답의 {@code version}을 그대로 되돌려
	 * 보내면 된다.
	 */
	@Transactional
	public PlacementSaveResponse update(
			Long userId, Long placementId, PlacementSnapshotRequest request) {
		requireOwned(userId, placementId);
		// 감사 시각은 auditingDateTimeProvider와 같은 앱 시계를 쓴다 — DB 시계(current_timestamp)를
		// 섞으면 같은 컬럼이 저장 경로마다 다른 시계로 찍힌다.
		if (request.version() == null
				|| placements.advanceVersion(
						placementId, request.version(), OffsetDateTime.now(), userId) == 0) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_STALE);
		}

		// advanceVersion이 영속성 컨텍스트를 비웠다 — 여기서 다시 읽어야 병합이 새 version 위에서 돈다.
		Placement placement = placements.findForUpdateById(placementId)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));
		return applySnapshot(placement, request);
	}

	/**
	 * 목록 — 데스크 피드와 내 작업실이 같은 엔드포인트를 쓴다(api-spec.md §4).
	 *
	 * <p><b>가시성은 여기서 판단하지 않는다</b> — {@code viewerId}를 그대로 넘기고
	 * {@code PlacementRepositoryImpl.visibleTo}가 목록·총 개수 양쪽에 같은 조건을 건다. 서비스가
	 * 후처리로 거르면 페이지 크기가 조용히 줄고(거른 만큼 빈다) 커서가 어긋난다.
	 *
	 * <p><b>{@code size + 1}을 읽어 다음 페이지 유무를 판단한다</b> — 별도 count 없이 알 수 있는 값이다
	 * ({@code ProductCatalogService.list}와 같은 형태).
	 *
	 * <p><b>{@code q}가 있으면 검색 경로로 갈라진다</b>(ADR-0027) — {@code owner}·
	 * {@code publishStatus}·{@code ids}·{@code hashtag}·{@code bookmarked} 필터는 그대로 같이 걸린다.
	 * {@code q}가 없으면 지금까지와 한 글자도 다르지 않다.
	 *
	 * <p><b>{@code hashtag}는 태그 칩 필터다</b>(DERO-493) — 이름 하나와 정확히 일치하는 배치만
	 * 남는다. 받아 온 페이지 안에서 거르지 않고 서버가 판정하는 이유는 검색과 같다: 클라이언트 필터는
	 * 커서 너머의 배치를 못 본다. {@code GET /posts?hashtag=}와 같은 규약이다.
	 *
	 * <p><b>{@code SUPPORTS}이고 DB 구간만 {@link #reads}로 감싼다.</b> 검색 경로는 ES 왕복 뒤에 DB
	 * 조회가 오는데, 하나의 트랜잭션으로 묶으면 <b>ES가 답할 때까지 커넥션 하나를 문 채 기다린다</b>.
	 * 폴백이 없어(ADR-0019 결정 6) 그 지연이 그대로 커넥션 보유 시간이 되고, 마르는 것은 검색이
	 * 아니라 관계없는 API 전부다. 진짜 못은 {@link PlacementSearchService#searchIds} 쪽
	 * {@code NEVER}다 — 트랜잭션 안에서 이 메서드를 부르면 거기서 터진다.
	 */
	@Transactional(propagation = Propagation.SUPPORTS)
	public CursorPage<PlacementSummaryResponse> list(Long viewerId, String owner,
			PublishStatus publishStatus, List<Long> ids, String hashtag, String bookmarked,
			String bookmarkGroup, PlacementSort sort, String q, String cursor, int size) {
		if (q == null || q.isBlank()) {
			return reads.execute(status -> listPage(
					viewerId, owner, publishStatus, ids, hashtag, bookmarked, bookmarkGroup, sort,
					cursor, size));
		}

		// 여기가 이 메서드에서 유일하게 오래 걸리는 구간이고, 그래서 트랜잭션 밖이다.
		List<Long> hitIds = placementSearchService.searchIds(q);
		return reads.execute(status -> searchPage(
				viewerId, owner, publishStatus, ids, hashtag, bookmarked, bookmarkGroup, hitIds,
				cursor, size));
	}

	private CursorPage<PlacementSummaryResponse> listPage(Long viewerId, String owner,
			PublishStatus publishStatus, List<Long> ids, String hashtag, String bookmarked,
			String bookmarkGroup, PlacementSort sort, String cursor, int size) {
		Long ownerId = resolveOwner(owner, viewerId);
		Map<Long, Long> bookmarkFilter = resolveBookmarkFilter(viewerId, bookmarked, bookmarkGroup);
		List<Long> bookmarkedIds =
				bookmarkFilter == null ? null : List.copyOf(bookmarkFilter.keySet());
		return page(viewerId, ownerId, publishStatus, ids, hashtag, null, bookmarkedIds,
				bookmarkFilter, sort, cursor, size);
	}

	/**
	 * 검색 경로 — <b>ES가 정하는 것은 어떤 배치가 몇 번째로 관련 있는가뿐이다.</b> 가시성
	 * ({@code PUBLIC} + 본인 소유)과 소프트 삭제, 나머지 필터는 Postgres가 판정하고, 그래서 검색
	 * 결과와 목록이 같은 술어를 공유한다(ADR-0019 결정 4 · ADR-0027 결정 4). 색인에 있는
	 * {@code PRIVATE} 배치가 남의 결과에 뜨지 않는 것이 이 구조의 결과다.
	 *
	 * <p><b>{@code sort}는 걸리지 않는다</b> — 관련도 순서가 곧 정렬이다. 최신순·인기순을 다시 얹으면
	 * ES가 매긴 순서를 버리게 되고, 검색 결과의 첫 줄이 "가장 관련 있는 것"이 아니게 된다.
	 *
	 * <p><b>커서에 담기는 값이 목록 경로와 다르다</b> — 목록은 복합 커서(정렬키 + id)지만 여기는
	 * <b>오프셋</b>이다. 관련도 순서에는 "이 값 다음"이라는 기준이 없다(점수가 같은 배치가 흔하고,
	 * 재색인 후 순서가 통째로 바뀔 수도 있다). 커서는 프론트가 열어보지 않는 불투명 문자열이라
	 * ({@link CursorCodec}) 담는 내용이 갈려도 호출부는 영향받지 않는다.
	 */
	private CursorPage<PlacementSummaryResponse> searchPage(Long viewerId, String owner,
			PublishStatus publishStatus, List<Long> ids, String hashtag, String bookmarked,
			String bookmarkGroup, List<Long> hitIds, String cursor, int size) {
		Long ownerId = resolveOwner(owner, viewerId);
		Map<Long, Long> bookmarkFilter = resolveBookmarkFilter(viewerId, bookmarked, bookmarkGroup);
		List<Long> bookmarkedIds =
				bookmarkFilter == null ? null : List.copyOf(bookmarkFilter.keySet());

		Map<Long, Placement> byId = placements
				.findAllVisibleByIds(hitIds, viewerId, ownerId, publishStatus, ids, hashtag,
						bookmarkedIds)
				.stream()
				.collect(Collectors.toMap(Placement::getId, found -> found));
		List<Placement> visible = hitIds.stream().map(byId::get).filter(Objects::nonNull).toList();

		Long decoded = CursorCodec.decode(cursor);
		int offset = decoded == null ? 0 : Math.max(decoded.intValue(), 0);
		int from = Math.min(offset, visible.size());
		int to = Math.min(from + size, visible.size());
		boolean hasNext = to < visible.size();

		List<Placement> content = visible.subList(from, to);
		Map<Long, Long> bookmarks =
				bookmarkFilter != null ? bookmarkFilter : bookmarksOf(viewerId, content);
		Map<Long, String> primaryImageKeys = primaryImageKeysOf(content);
		Map<Long, Long> totalPrices = totalPricesOf(content);

		return new CursorPage<>(
				content.stream()
						.map(placement ->
								summaryOf(placement, bookmarks, primaryImageKeys, totalPrices))
						.toList(),
				hasNext ? CursorCodec.encode((long) to) : null,
				hasNext,
				visible.size());
	}

	/**
	 * 이 배치를 리믹스한 것들 → 200. <b>비로그인도 볼 수 있지만 가시성 규칙은 그대로다</b> — 남의
	 * 비공개 리믹스는 목록에 없다({@code visibleTo}가 목록 쿼리 안에 있다).
	 *
	 * <p>원본이 안 보이면 404다 — 안 그러면 "그 비공개 배치는 리믹스가 3건"이라는 사실이 샌다.
	 */
	public CursorPage<PlacementSummaryResponse> listRemixes(
			Long viewerId, Long placementId, String cursor, int size) {
		requireVisible(placementId, viewerId);
		return page(viewerId, null, null, null, null, placementId, null, null,
				PlacementSort.LATEST, cursor, size);
	}

	/**
	 * 상세 — 가시성은 쿼리가 거른다. 안 맞으면 404다(403이 아니다, api-spec.md §4).
	 *
	 * <p>{@code userId}는 nullable이다. 이 경로는 {@code permitAll}이라 {@code Authentication}이
	 * {@code AnonymousAuthenticationToken}일 수 있고, 그 신원은 {@code AuthenticatedUserId.orNull}이
	 * NULL로 정리해 넘겨준다.
	 */
	public PlacementDetailResponse get(Long placementId, Long userId) {
		return detailOf(requireVisible(placementId, userId));
	}

	/**
	 * 리믹스 → 201. <b>복사는 서버가 한다</b> — 클라이언트가 상세를 받아 재조립해
	 * {@code POST /placements}로 보내면 출처가 자기 신고가 되어 위조된다(REQ-COM-02·03).
	 * 요청 본문이 아예 없는 이유도 같다: 출처는 경로의 {@code {id}}가 유일한 입력이다.
	 *
	 * <p><b>원본이 {@link PublishStatus#PUBLIC}일 때만 성립하고 아니면 404다</b> — 가시성 규칙과
	 * 같은 답이라 "그 id의 비공개 배치가 존재한다"를 흘리지 않는다. 내 비공개 배치도 여기서는
	 * 404다(복제는 리믹스가 아니다).
	 *
	 * <p>스크린샷·상상도는 복사하지 않는다 — 새 배치는 아직 업로드 전이라 남이 찍은 화면을 내
	 * 작업실 카드로 쓰면 거짓말이 된다. 둘 다 이 애그리거트 밖이라 {@link Placement#copyOf}가
	 * 손댈 자리도 없다.
	 */
	@Transactional
	public PlacementDetailResponse remix(Long userId, Long sourcePlacementId) {
		Placement source = placements.findVisibleById(sourcePlacementId, userId)
				.filter(found -> found.getPublishStatus() == PublishStatus.PUBLIC)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));

		Placement copy = Placement.copyOf(users.getReferenceById(userId), source);
		placements.save(copy);
		// 채번된 id를 지금 받아야 Location과 아이템 id를 응답에 실을 수 있다(applySnapshot과 같은 사유).
		placements.flush();
		events.publishEvent(new PlacementChangedEvent(copy.getId()));
		return detailOf(copy);
	}

	/** 삭제 → 204. 소프트 삭제라 목록·상세 쿼리의 {@code deleted_at is null}이 걸러 낸다. */
	@Transactional
	public void delete(Long userId, Long placementId) {
		requireOwned(userId, placementId).softDelete();
		// 지워진 배치가 검색 상한 자리를 차지하지 않게 색인에서도 뗀다 — 리스너가 "없으면 제거"로 푼다.
		events.publishEvent(new PlacementChangedEvent(placementId));
	}

	/**
	 * 썸네일 2단계 presign의 1단계 — presigned PUT URL 발급. 저장하는 게 없어 200이다.
	 *
	 * <p>key는 캡처마다 uuid로 새로 발급한다({@code placement-thumbnails/{id}/{uuid}.png},
	 * ADR-0035 결정 3) — 안정 공개 URL이 {@code immutable} 캐시를 걸어서 같은 자리 덮어쓰기와
	 * 양립하지 않는다. 옛 스크린샷은 고아로 남고, 2단계 검증은 {@code placement-thumbnails/{id}/}
	 * 접두 비교로 성립한다.
	 */
	public ThumbnailUploadUrlResponse presignThumbnailUpload(Long userId, Long placementId) {
		Placement placement = requireOwned(userId, placementId);
		String thumbnailKey = newThumbnailKeyOf(placement.getId());
		return new ThumbnailUploadUrlResponse(
				thumbnailKey, presignPort.presignUpload(thumbnailKey, THUMBNAIL_CONTENT_TYPE));
	}

	/**
	 * 2단계 — 업로드가 끝난 key 등록 → 204. 재등록은 덮어쓴다.
	 *
	 * <p>이 배치의 key가 아니면 400이다. 검증이 필요한 이유: key가 그대로 presigned GET URL의 입력이라,
	 * 아무 문자열이나 받으면 남의 파일 주소를 자기 배치 상세에 실을 수 있다.
	 *
	 * <p><b>쓰기는 벌크 UPDATE다 — 엔티티를 고치면 {@code @Version}이 올라 다음 저장이 영원히
	 * 409다.</b> 사유는 {@link PlacementRepository#updateThumbnailKey}.
	 */
	@Transactional
	public void registerThumbnail(
			Long userId, Long placementId, ThumbnailRegisterRequest request) {
		requireOwned(userId, placementId);
		String ownedPrefix = THUMBNAIL_KEY_PREFIX + placementId + "/";
		if (!request.thumbnailKey().startsWith(ownedPrefix)
				|| !request.thumbnailKey().endsWith(THUMBNAIL_KEY_SUFFIX)) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_INVALID_THUMBNAIL_KEY);
		}
		placements.updateThumbnailKey(placementId, request.thumbnailKey());
	}

	/**
	 * 목록 한 페이지. {@code list}·{@code listRemixes}가 같은 조립을 쓰므로 여기 한 곳에 둔다 —
	 * 가시성·커서·총 개수가 갈리면 두 목록의 답이 달라진다.
	 *
	 * <p>{@code knownBookmarks}는 {@code ?bookmarked=me}가 이미 읽어 둔 결과다. 그때는 페이지의
	 * 모든 항목이 그 안에 있으므로 플래그 조회를 한 번 더 하지 않는다.
	 */
	private CursorPage<PlacementSummaryResponse> page(Long viewerId, Long ownerId,
			PublishStatus publishStatus, List<Long> ids, String hashtag, Long sourcePlacementId,
			List<Long> bookmarkedIds, Map<Long, Long> knownBookmarks, PlacementSort sort,
			String cursor, int size) {
		List<Placement> rows = placements.findVisiblePage(viewerId, ownerId, publishStatus, ids,
				hashtag, sourcePlacementId, bookmarkedIds, sort, CursorCodec.decodeComposite(cursor),
				Limit.of(size + 1));

		boolean hasNext = rows.size() > size;
		List<Placement> content = hasNext ? rows.subList(0, size) : rows;
		Map<Long, Long> bookmarks =
				knownBookmarks != null ? knownBookmarks : bookmarksOf(viewerId, content);
		Map<Long, String> primaryImageKeys = primaryImageKeysOf(content);
		Map<Long, Long> totalPrices = totalPricesOf(content);
		List<PlacementSummaryResponse> responses = content.stream()
				.map(placement -> summaryOf(placement, bookmarks, primaryImageKeys, totalPrices))
				.toList();
		String nextCursor = hasNext
				? CursorCodec.encode(
						sort.cursorValueOf(content.getLast()), content.getLast().getId())
				: null;

		return new CursorPage<>(responses, nextCursor, hasNext, placements.countVisible(
				viewerId, ownerId, publishStatus, ids, hashtag, sourcePlacementId, bookmarkedIds));
	}

	/**
	 * 이 페이지 항목들의 per-user 북마크 상태. <b>페이지의 id 묶음으로 한 번에 조회한다</b> —
	 * 카드마다 물으면 N+1이라 갤러리가 서버 진실을 아예 안 그리던 자리다.
	 */
	private Map<Long, Long> bookmarksOf(Long viewerId, List<Placement> content) {
		if (viewerId == null || content.isEmpty()) {
			return Map.of();
		}
		return bookmarkRowsToMap(placements.findBookmarkRows(
				viewerId, content.stream().map(Placement::getId).toList()));
	}

	/**
	 * 이 페이지 항목들의 대표 상상도 key. <b>북마크와 같은 이유로 페이지의 id 묶음 하나로 읽는다</b> —
	 * 카드마다 물으면 N+1이다. 업로드 전 배치는 행이 없어 맵에도 없다.
	 */
	/**
	 * 이 페이지 항목들의 실제 데스크 값. <b>합계 규칙은 견적 API와 같은 함수가 갖는다</b> — 목록이
	 * 따로 세면 카드와 상세가 다른 금액을 말한다. 페이지의 id 묶음으로 읽는 것도 같은 이유다(카드마다
	 * 견적을 부르면 N+1).
	 */
	private Map<Long, Long> totalPricesOf(List<Placement> content) {
		if (content.isEmpty()) {
			return Map.of();
		}
		return placementEstimateService.totalPriceKrwByIds(
				content.stream().map(Placement::getId).toList());
	}

	private Map<Long, String> primaryImageKeysOf(List<Placement> content) {
		if (content.isEmpty()) {
			return Map.of();
		}
		List<Object[]> rows = placements.findPrimaryImageRows(
				content.stream().map(Placement::getId).toList());
		Map<Long, String> byPlacementId = HashMap.newHashMap(rows.size());
		for (Object[] row : rows) {
			byPlacementId.put(((Number) row[0]).longValue(), (String) row[1]);
		}
		return byPlacementId;
	}

	/**
	 * {@code ?bookmarked=me}(+{@code ?bookmarkGroup})를 필터용 북마크 목록으로 푼다. 필터를 안 걸었으면
	 * {@code null}이고, 걸었는데 하나도 없으면 <b>빈 맵</b>이다(둘은 다른 뜻이다 —
	 * {@code PlacementRepositoryImpl.bookmarkedIn}).
	 *
	 * <p>비로그인이면 401이다. 빈 결과로 뭉개면 "내가 담은 게 없다"와 구분이 안 돼 프론트가 로그인
	 * 유도 대신 빈 상태를 그린다({@code ?owner=me}와 같은 판단).
	 */
	private Map<Long, Long> resolveBookmarkFilter(
			Long viewerId, String bookmarked, String bookmarkGroup) {
		boolean hasGroup = bookmarkGroup != null && !bookmarkGroup.isBlank();
		if (bookmarked == null || bookmarked.isBlank()) {
			if (hasGroup) {
				// 그룹만 오면 "무엇의 그룹인가"가 없다. 조용히 무시하면 그룹 화면이 필터 안 걸린
				// 전체 목록을 그 그룹인 척 그린다 — 400으로 시끄럽게 실패한다.
				throw new BusinessException(CommonErrorCode.INVALID_INPUT);
			}
			return null;
		}
		if (!BOOKMARKED_ME.equals(bookmarked)) {
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
		if (viewerId == null) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_BOOKMARKED_ME_REQUIRES_LOGIN);
		}

		Map<Long, Long> mine = bookmarkRowsToMap(placements.findAllBookmarkRows(viewerId));
		if (!hasGroup) {
			return mine;
		}
		Long groupId =
				UNGROUPED_BOOKMARK.equals(bookmarkGroup) ? null : parseBookmarkGroup(bookmarkGroup);
		Map<Long, Long> filtered = new HashMap<>();
		mine.forEach((placementId, group) -> {
			if (Objects.equals(groupId, group)) {
				filtered.put(placementId, group);
			}
		});
		return filtered;
	}

	private Long parseBookmarkGroup(String bookmarkGroup) {
		try {
			return Long.valueOf(bookmarkGroup);
		} catch (NumberFormatException e) {
			// 숫자도 "none"도 아닌 값은 클라이언트 입력 오류다 — 500이 아니라 400으로 번역한다(규칙 8).
			throw new BusinessException(CommonErrorCode.INVALID_INPUT);
		}
	}

	/**
	 * 네이티브 두 컬럼 조회를 {@code placementId → 그룹 id}로 편다.
	 *
	 * <p><b>담겼지만 그룹 미지정이면 값이 {@code null}이다</b> — "안 담음"과 구분해야 하므로 읽는
	 * 쪽은 {@code get}이 아니라 {@code containsKey}로 판단한다. 그래서 {@code Collectors.toMap}을
	 * 쓸 수 없다(null 값에 NPE).
	 */
	private Map<Long, Long> bookmarkRowsToMap(List<Object[]> rows) {
		Map<Long, Long> byPlacementId = HashMap.newHashMap(rows.size());
		for (Object[] row : rows) {
			byPlacementId.put(
					((Number) row[0]).longValue(),
					row[1] == null ? null : ((Number) row[1]).longValue());
		}
		return byPlacementId;
	}

	private Placement requireVisible(Long placementId, Long userId) {
		return placements.findVisibleById(placementId, userId)
				.orElseThrow(() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));
	}

	private PlacementDetailResponse detailOf(Placement placement) {
		PlacementDesk desk = placement.getDesk();
		Placement source = placement.getSourcePlacement();
		return new PlacementDetailResponse(
				placement.getId(),
				placement.getTitle(),
				placement.getDescription(),
				placement.getPublishStatus(),
				placement.getVersion(),
				placement.isRoomLightOn(),
				wallsOf(placement),
				FloorResponse.from(placement),
				placement.getTimeOfDay(),
				placement.getBudgetKrw(),
				thumbnailUrl(placement),
				placement.getCreatedAt(),
				placement.getUpdatedAt(),
				source == null ? null : RemixSourceResponse.from(source),
				desk == null ? null : DeskDetailResponse.from(desk),
				placement.getItems().stream().map(ItemDetailResponse::from).toList());
	}

	/**
	 * 상세 응답의 벽면 3면 — 좌·전면·우 순서 고정(enum 선언 순서). DB 행 순서에 걸지 않는다.
	 *
	 * <p>옛 3컬럼으로 3면을 합성하던 폴백은 사라졌다(DERO-514) — 벽면 행 없는 배치를 V9가
	 * 백필했고 생성 경로가 3행을 시드하므로, "배치당 정확히 3행"이 스키마 쪽 불변이다.
	 */
	private List<WallDetailResponse> wallsOf(Placement placement) {
		return placement.getWalls().stream()
				.sorted(Comparator.comparing(PlacementWall::getWallSide))
				.map(WallDetailResponse::from)
				.toList();
	}

	private PlacementSaveResponse applySnapshot(
			Placement placement, PlacementSnapshotRequest request) {
		request.desk().validate();
		// walls를 실은 요청은 3면 완전 세트를 검증해 받고, 생략(null)은 옛 클라이언트다.
		List<WallSnapshot> walls = request.resolveWalls();
		List<ItemSnapshot> ordered = orderMountTargetsFirst(request.items());

		placement.updateScene(request.title(), request.description(), request.isRoomLightOn(),
				request.budgetKrw());
		// 생략(null)은 "기존 유지"다 — 마감을 모르는 옛 클라이언트의 저장이 백필·신규 저장된
		// 마감을 지우면 안 된다(무회귀). 사유는 각 메서드 javadoc.
		placement.applyFloor(request.floor());
		placement.applyTimeOfDay(request.timeOfDay());
		if (walls != null) {
			placement.applyWalls(walls);
		}
		applyDesk(placement, request.desk());
		Map<String, PlacedItem> byRef = placement.mergeItems(ordered, loadProducts(ordered));

		try {
			// 채번된 placed_item.id를 지금 받아야 ref → id 매핑을 응답에 실을 수 있다. save()를 부르지
			// 않는 이유: id가 있는 루트는 merge() 경로를 타고, cascade merge가 새 아이템의 복사본을
			// 만들어 채번된 id가 여기 인스턴스가 아니라 그 복사본에 붙는다(ProductImageService와 같은 함정).
			placements.flush();
		} catch (ObjectOptimisticLockingFailureException e) {
			// 같은 배치를 동시에 저장한 다른 트랜잭션이 먼저 커밋했다 — 409로 번역한다(규칙 8).
			throw new BusinessException(PlacementErrorCode.PLACEMENT_STALE);
		}

		// 제목·설명이 색인 대상이라 저장 경로가 곧 색인 트리거다. 커밋 뒤에 도는 리스너가 받는다.
		events.publishEvent(new PlacementChangedEvent(placement.getId()));

		List<ItemRefMapping> mappings = ordered.stream()
				.map(item -> new ItemRefMapping(item.ref(), byRef.get(item.ref()).getId()))
				.toList();
		return new PlacementSaveResponse(placement.getId(), placement.getUpdatedAt(),
				placement.getVersion(), mappings, violationsOf(placement));
	}

	/**
	 * 서버 정본 재판정(ADR-0004) → 저장 응답의 경고 목록. <b>저장은 위반이 있어도 성공한다</b>
	 * (ADR-0009 결정 5 개정) — 고르는 중인 작업을 잃게 하지 않기 위해서고, 게이트는 공개에 걸린다.
	 *
	 * <p>재판정은 병합이 끝난 <b>뒤</b>에 돌린다 — 요청 스냅샷이 아니라 실제로 저장될 상태를 봐야
	 * 한다. 클라이언트가 본문에 판정 결과를 실어 보내도 읽는 자리가 없다.
	 *
	 * <p><b>{@code CONDITIONAL}은 위반으로 싣지 않는다.</b> 그건 규격이 미등록이라는 안내이지 규격
	 * 위반이 아니고, 이 목록이 나중에 공개 게이트(422)의 입력이 되므로 카탈로그 데이터 결측이 사용자의
	 * 공개를 막는 결과가 된다. 조건부까지 보고 싶은 화면은 {@code POST /compatibility/judgments}가
	 * 전체 행을 준다.
	 */
	private List<ViolationResponse> violationsOf(Placement placement) {
		return PlacementJudge.judge(placement).stream()
				.filter(row -> row.judgment().result() == JudgmentResult.INCOMPATIBLE)
				.map(row -> new ViolationResponse(
						row.kind().name() + "_" + row.judgment().result().name(),
						row.itemId(),
						String.join(" · ", row.judgment().reasons())))
				.toList();
	}

	/**
	 * 제품 모드면 규격을 카탈로그 책상에서 복사하고, 직접 입력 모드면 요청 값을 그대로 쓴다.
	 * <b>제품 모드에서 본문의 치수는 읽지 않는다</b> — 읽으면 규격을 위조한 배치가 성립한다.
	 */
	private void applyDesk(Placement placement, DeskSnapshot snapshot) {
		if (snapshot.specSource() == SpecSource.PRODUCT) {
			Desk product = loadDeskProduct(snapshot.productId());
			putDesk(placement, SpecSource.PRODUCT, product, product.getWidthMm(),
					product.getDepthMm(), product.getHeightMm(), product.getTopThicknessMm(),
					product.getEdgeThicknessMm(), product.getDeskTexture(), product.getFrameType());
			return;
		}
		putDesk(placement, SpecSource.CUSTOM, null, snapshot.widthMm(), snapshot.depthMm(),
				snapshot.heightMm(), snapshot.topThicknessMm(), snapshot.edgeThicknessMm(),
				loadDeskTexture(snapshot.deskTextureId()), snapshot.frameType());
	}

	private void putDesk(Placement placement, SpecSource specSource, Product product, int widthMm,
			int depthMm, int heightMm, int topThicknessMm, Integer edgeThicknessMm,
			DeskTexture deskTexture, FrameType frameType) {
		PlacementDesk desk = placement.getDesk();
		if (desk != null) {
			desk.apply(specSource, product, widthMm, depthMm, heightMm, topThicknessMm,
					edgeThicknessMm, deskTexture, frameType);
			return;
		}
		placement.attachDesk(specSource == SpecSource.PRODUCT
				? PlacementDesk.fromProduct(placement, product, widthMm, depthMm, heightMm,
						topThicknessMm, edgeThicknessMm, deskTexture, frameType)
				: PlacementDesk.fromCustom(placement, widthMm, depthMm, heightMm, topThicknessMm,
						edgeThicknessMm, deskTexture, frameType));
	}

	/**
	 * <b>{@code Hibernate.unproxy}가 필수다</b> — JOINED 상속 + 1차 캐시 동일성 규칙 때문에 조회가
	 * <b>베이스 타입 {@code Product} 프록시</b>를 그대로 돌려줄 수 있고, 그러면 {@code instanceof}가
	 * 조용히 거짓이 된다. 업데이트 경로에서 결정론적으로 재현된다: {@code findForUpdateById}가
	 * {@code desk}를 하이드레이트하는 순간 {@code PlacementDesk.product}(LAZY)가 프록시로 1차 캐시에
	 * 박히고, 여기 조회가 그 프록시를 받아 {@code spec_type = DESK}인 제품이 "책상이 아니다" 400을
	 * 받는다(2026-08-02 운영 실측).
	 */
	private Desk loadDeskProduct(Long productId) {
		Product product = products.findByIdAndDeletedAtIsNull(productId)
				.orElseThrow(
						() -> new BusinessException(PlacementErrorCode.PLACEMENT_UNKNOWN_PRODUCT));
		if (!(Hibernate.unproxy(product) instanceof Desk desk)) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_INVALID_DESK_PRODUCT);
		}
		return desk;
	}

	private DeskTexture loadDeskTexture(Long deskTextureId) {
		return deskTextures.findByIdAndDeletedAtIsNull(deskTextureId)
				.orElseThrow(() -> new BusinessException(
						PlacementErrorCode.PLACEMENT_UNKNOWN_DESK_TEXTURE));
	}

	/**
	 * <b>{@code Hibernate.unproxy}가 필수인 사유는 {@link #loadDeskProduct}와 같다.</b> 업데이트
	 * 경로에서는 {@code findForUpdateById}가 방금 하이드레이트한 기존 {@code placed_item}의
	 * {@code product}가 베이스 타입 프록시로 1차 캐시에 박혀 있어, 여기 조회가 그 프록시를 돌려준다.
	 * 풀지 않으면 {@link PlacementJudge}의 {@code instanceof}가 전부 거짓이 되어 <b>업데이트 경로의
	 * 판정 행이 통째로 사라진다</b> — 예외가 아니라 "위반이 하나도 없다"로 나타나 통과로 오독된다.
	 */
	private Map<Long, Product> loadProducts(List<ItemSnapshot> items) {
		Set<Long> productIds =
				items.stream().map(ItemSnapshot::productId).collect(Collectors.toSet());
		Map<Long, Product> byId = products.findAllById(productIds).stream()
				.map(product -> (Product) Hibernate.unproxy(product))
				.filter(product -> !product.isDeleted())
				.collect(Collectors.toMap(Product::getId, product -> product));
		if (byId.size() != productIds.size()) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_UNKNOWN_PRODUCT);
		}
		return byId;
	}

	/**
	 * {@code ref} 그래프를 검증하고 <b>물릴 대상이 앞에 오도록</b> 정렬한다. PostgreSQL FK가
	 * {@code NOT DEFERRABLE}이라 물린 쪽이 먼저 INSERT되면 그 자리에서 위반이다 —
	 * Hibernate가 자기참조 INSERT 순서를 보장하는지에 걸지 않는다(ADR-0009 결정 8).
	 */
	private List<ItemSnapshot> orderMountTargetsFirst(List<ItemSnapshot> items) {
		Map<String, ItemSnapshot> byRef = LinkedHashMap.newLinkedHashMap(items.size());
		for (ItemSnapshot item : items) {
			if (byRef.put(item.ref(), item) != null) {
				throw new BusinessException(PlacementErrorCode.PLACEMENT_DUPLICATE_ITEM_REF);
			}
		}
		for (ItemSnapshot item : items) {
			if (item.mountedToRef() == null) {
				continue;
			}
			if (item.mountedToRef().equals(item.ref())) {
				throw new BusinessException(PlacementErrorCode.PLACEMENT_INVALID_MOUNT);
			}
			if (!byRef.containsKey(item.mountedToRef())) {
				throw new BusinessException(PlacementErrorCode.PLACEMENT_UNKNOWN_ITEM_REF);
			}
		}

		List<ItemSnapshot> ordered = new ArrayList<>(items.size());
		Set<String> placed = HashSet.newHashSet(items.size());
		for (ItemSnapshot item : byRef.values()) {
			appendAfterMountTarget(item, byRef, placed, ordered, new HashSet<>());
		}
		return ordered;
	}

	/** 깊이 우선 삽입. {@code visiting}에 이미 있는 {@code ref}로 되돌아오면 순환 결합이다. */
	private void appendAfterMountTarget(ItemSnapshot item, Map<String, ItemSnapshot> byRef,
			Set<String> placed, List<ItemSnapshot> ordered, Set<String> visiting) {
		if (placed.contains(item.ref())) {
			return;
		}
		if (!visiting.add(item.ref())) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_INVALID_MOUNT);
		}
		if (item.mountedToRef() != null) {
			appendAfterMountTarget(byRef.get(item.mountedToRef()), byRef, placed, ordered, visiting);
		}
		ordered.add(item);
		placed.add(item.ref());
	}

	private Placement requireOwned(Long userId, Long placementId) {
		Placement placement = placements.findByIdAndDeletedAtIsNull(placementId)
				.orElseThrow(
						() -> new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND));
		requireOwner(placement, userId);
		return placement;
	}

	/** 남의 배치에는 <b>404</b>다 — 403이면 "그 id의 배치가 존재한다"를 흘린다(api-spec.md §4). */
	private void requireOwner(Placement placement, Long userId) {
		if (!placement.isOwnedBy(userId)) {
			throw new BusinessException(PlacementErrorCode.PLACEMENT_NOT_FOUND);
		}
	}

	/**
	 * {@code ?owner}를 소유자 id로 푼다. {@code me}는 호출자 자신이고 <b>비로그인이면 401이다</b> —
	 * NULL로 흘리면 소유자 조건이 통째로 빠져 "내 배치"를 요청한 화면에 남의 공개 배치가 뜬다.
	 */
	private Long resolveOwner(String owner, Long viewerId) {
		if (owner == null || owner.isBlank()) {
			return null;
		}
		if (OWNER_ME.equals(owner)) {
			if (viewerId == null) {
				throw new BusinessException(PlacementErrorCode.PLACEMENT_OWNER_ME_REQUIRES_LOGIN);
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

	private PlacementSummaryResponse summaryOf(Placement placement, Map<Long, Long> bookmarks,
			Map<Long, String> primaryImageKeys, Map<Long, Long> totalPrices) {
		User owner = placement.getUser();
		return new PlacementSummaryResponse(
				placement.getId(),
				placement.getTitle(),
				placement.getDescription(),
				tagNamesOf(placement),
				placement.getPublishStatus(),
				placement.isTemplate(),
				placement.getBudgetKrw(),
				// 예산이 아니라 실제 데스크 값이다 — 아이템도 제품 책상도 없으면 맵에 없고 0이다.
				totalPrices.getOrDefault(placement.getId(), 0L),
				placement.getLikeCount(),
				owner == null ? null : owner.getId(),
				owner == null ? null : owner.getNickname(),
				thumbnailUrl(placement),
				// 피드 카드의 표지는 이쪽이다 — 업로드 전이면 대표 상상도가 아예 없어 null이다.
				publicImageUrlOrNull(primaryImageKeys.get(placement.getId())),
				// 그룹 미지정 북마크는 값이 null이라 get으로는 "안 담음"과 구분되지 않는다.
				bookmarks.containsKey(placement.getId()),
				bookmarks.get(placement.getId()),
				placement.getCreatedAt(),
				placement.getUpdatedAt());
	}

	private String thumbnailUrl(Placement placement) {
		return publicImageUrlOrNull(placement.getThumbnailKey());
	}

	/**
	 * 카드에 그릴 태그 이름들. <b>컬렉션이라 목록 쿼리에서 {@code join fetch}하지 않는다</b> — 태그가
	 * 여러 개인 배치가 행으로 곱해져 커서 페이지 크기가 어긋난다(query-conventions §3). 여기서 처음
	 * 접근할 때 {@code default_batch_fetch_size = 100}이 페이지 전체를 IN 하나로 묶어 읽는다
	 * ({@code PostService.hashtagNamesOf}와 같은 형태).
	 */
	private List<String> tagNamesOf(Placement placement) {
		return placement.getHashtags().stream()
				.map(PlacementHashtag::getHashtag)
				.map(Hashtag::getName)
				.toList();
	}

	private String publicImageUrlOrNull(String key) {
		return key == null ? null : publicImageUrl.url(key);
	}

	private String newThumbnailKeyOf(Long placementId) {
		return THUMBNAIL_KEY_PREFIX + placementId + "/" + UUID.randomUUID() + THUMBNAIL_KEY_SUFFIX;
	}
}
