package com.brunchies.dero.placement.repository;

import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.SpecSource;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 배치 애그리거트 루트 리포지토리(ADR-0007) — {@code placement_desk}·{@code placed_item}이 이 안에
 * 산다. {@code PlacedItemRepository}·{@code PlacementDeskRepository}를 만들지 않는다: 만드는 순간
 * 루트를 우회한 쓰기가 열리고 {@code @Version}이 루트에만 있어(ADR-0009 결정 4) 그 쓰기는 충돌을
 * 감지하지 못한다.
 *
 * <p><b>소프트 삭제 필터는 전 메서드의 쿼리에 박는다</b>(규칙 2) — 서비스에서 거르면 한 자리만
 * 빠뜨려도 지워진 배치가 그 경로에서만 살아난다. 실제로 옛 {@code findForUpdateById}가 그 한 자리였다.
 */
public interface PlacementRepository
		extends JpaRepository<Placement, Long>, PlacementRepositoryCustom {

	/**
	 * 요청이 들고 온 버전과 <b>같을 때만</b> {@code version}을 1 올린다. 반환값 0은 "그 사이에 누가
	 * 먼저 저장했다"이고 서비스가 409로 바꾼다.
	 *
	 * <p><b>왜 {@code @Lock}이 아니라 벌크 UPDATE인가</b>(2026-08-01 실측 3건):
	 * <ol>
	 *   <li>{@code OPTIMISTIC_FORCE_INCREMENT}는 <b>커밋 시점</b>에 올린다 — 응답을 만드는 시점엔
	 *       아직 안 올라 있어서 저장 응답이 커밋된 값보다 1 작게 나가고, 클라이언트가 그 값을 다음
	 *       저장에 실어 보내면 <b>영원히 409</b>다.</li>
	 *   <li>락 모드는 결과에 실린 모든 엔티티에 적용돼서 {@code join fetch}와 같이 못 쓴다 —
	 *       {@code placed_item}엔 {@code @Version}이 없어 {@code "has no version and may not be
	 *       locked"}로 죽는다.</li>
	 *   <li>{@code placement.items}는 {@code mappedBy} 역방향이라 <b>아이템만 바뀌면 루트 version이
	 *       안 오른다</b>(ADR-0009 결정 4가 "확인 못 함"으로 남긴 자리 — 확인했고, 안 오른다).
	 *       그래서 강제 증가 자체는 반드시 필요하다.</li>
	 * </ol>
	 * 벌크 UPDATE는 비교와 증가가 한 문장이라 원자적이고, 증가 결과가 <b>즉시</b> 보인다.
	 *
	 * <p>{@code clearAutomatically}가 영속성 컨텍스트를 비우므로 <b>호출 뒤에 배치를 다시 읽어야
	 * 한다</b> — 그래야 뒤따르는 병합이 새 version 위에서 돈다.
	 *
	 * <p><b>감사 컬럼도 여기서 같이 찍는다</b>(2026-08-02 운영 실측 — 배치 206은 아이템이 6개인데
	 * {@code updated_at}이 NULL이었다). {@code @LastModifiedDate}는 Hibernate가 루트 행에 UPDATE를
	 * 낼 때만 도는데, 아이템만 옮긴 저장은 루트 필드가 하나도 안 바뀌어 dirty checking이 루트를 안
	 * 잡는다 — 위 3번과 같은 뿌리다. 그러면 "마지막 수정"이 영원히 생성 시각으로 표시된다. 벌크
	 * UPDATE는 감사 리스너를 안 타므로 시각·주체를 인자로 받는다.
	 */
	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("""
			update Placement p
			set p.version = p.version + 1, p.updatedAt = :now, p.updatedBy = :userId
			where p.id = :id and p.version = :version and p.deletedAt is null
			""")
	int advanceVersion(@Param("id") Long id, @Param("version") Long version,
			@Param("now") OffsetDateTime now, @Param("userId") Long userId);

	/**
	 * 썸네일 key 등록 — <b>버전을 건드리지 않는 벌크 UPDATE다.</b>
	 *
	 * <p><b>왜 엔티티 메서드 + dirty checking이 아닌가</b>(2026-08-02 운영 실측, 배치 103·104·105):
	 * {@code @Version}은 <b>씬 스냅샷 변경만</b> 추적해야 한다. 썸네일 key는 스냅샷이 아니라 캡처
	 * 부산물인데 dirty checking에 맡기면 이 필드 하나 때문에 version이 +1 되고, 클라이언트는 저장
	 * 응답의 version만 알고 있으므로 다음 {@code PUT /placements/{id}}가 <b>영원히 409
	 * PLACEMENT_STALE</b>이다 — 클라이언트가 모르는 새 낙관적 락 계약이 깨진 것이라 재로드 말고는
	 * 빠져나올 길이 없다.
	 *
	 * <p>소유 확인과 key 검증은 호출부({@code PlacementService.registerThumbnail})가 이미 끝내고
	 * 들어온다 — 그래서 반환값을 보지 않는다.
	 */
	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("""
			update Placement p
			set p.thumbnailKey = :thumbnailKey
			where p.id = :id and p.deletedAt is null
			""")
	void updateThumbnailKey(@Param("id") Long id, @Param("thumbnailKey") String thumbnailKey);

	/**
	 * 좋아요 집계 캐시 +1. {@code placement_like} 행이 실제로 들어간 뒤에만 부른다 — 정본은 그 표이고
	 * 이 값은 파생이다({@link com.brunchies.dero.placement.Placement} Javadoc).
	 *
	 * <p><b>벌크인 사유는 {@link #updateThumbnailKey}와 같다</b> — 좋아요는 남이 누르는데, dirty
	 * checking으로 올리면 그 순간 편집 중인 소유자의 다음 저장이 409로 튕긴다.
	 *
	 * <p>덤으로 <b>원자적</b>이다 — 읽고 더해서 쓰는 방식은 동시에 두 사람이 누르면 한 번을 잃는다.
	 */
	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("""
			update Placement p
			set p.likeCount = p.likeCount + 1
			where p.id = :id and p.deletedAt is null
			""")
	void incrementLikeCount(@Param("id") Long id);

	/**
	 * 좋아요 집계 캐시 −1. 지워진 행이 없으면 부르지 않는다. 벌크인 사유는
	 * {@link #incrementLikeCount}와 같다.
	 *
	 * <p>파생값이라 원천과 어긋날 수 있으므로 <b>음수로는 내려가지 않게</b> {@code case}로 막는다 —
	 * 음수 카운트는 어떤 화면에서도 뜻이 없다.
	 */
	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("""
			update Placement p
			set p.likeCount = case when p.likeCount > 0 then p.likeCount - 1 else 0 end
			where p.id = :id and p.deletedAt is null
			""")
	void decrementLikeCount(@Param("id") Long id);

	/**
	 * 저장 경로 — 병합 대상 아이템까지 한 번에 끌어온다.
	 *
	 * <p>{@code items}는 bag 하나뿐이라 {@code MultipleBagFetchException}이 나지 않고, 페이지네이션이
	 * 없어 {@code HHH90003004}도 대상이 아니다. {@code desk}는 역방향 nullable 1:1이라 명시적
	 * {@code left join fetch}가 필요하다(query-conventions §2).
	 */
	@Query("""
			select p from Placement p
				left join fetch p.desk
				left join fetch p.items
			where p.id = :id
				and p.deletedAt is null
			""")
	Optional<Placement> findForUpdateById(@Param("id") Long id);

	/**
	 * 소유자 확인·삭제 경로 — 아이템을 안 물고 가는 가벼운 조회다.
	 */
	Optional<Placement> findByIdAndDeletedAtIsNull(Long id);

	/**
	 * 공개 게이트 경로 — <b>규격 서브타입까지 끌어온다</b>({@code left join fetch i.product}).
	 *
	 * <p>{@link com.brunchies.dero.placement.judgment.PlacementJudge}가 {@code PlacedItem.product}에
	 * {@code instanceof}로 서브타입을 가르는데, <b>그 참조가 LAZY 프록시면 전부 조용히 거짓이 되고 판정
	 * 행이 통째로 사라진다</b>({@code placement/CLAUDE.md}). 저장 경로가 안전한 건 병합이 방금 구체
	 * 타입을 꽂아 줬기 때문이지 {@code instanceof}가 안전해서가 아니다 — 조회만 한 배치를 판정하려면
	 * 이 fetch join이 필수다. 증상이 예외가 아니라 <b>"위반이 하나도 없다"</b> 라서 통과로 오독된다.
	 *
	 * <p>컬렉션 bag은 {@code p.items} 하나뿐이라 {@code MultipleBagFetchException}이 나지 않고,
	 * {@code i.product}는 ToOne이라 같이 실어도 된다. 페이지네이션이 없어 {@code HHH90003004}도 대상이
	 * 아니다.
	 */
	@Query("""
			select p from Placement p
				left join fetch p.desk
				left join fetch p.items i
				left join fetch i.product
			where p.id = :id
				and p.deletedAt is null
			""")
	Optional<Placement> findForJudgmentById(@Param("id") Long id);

	/**
	 * 상세 조회 — <b>가시성 규칙이 쿼리 안에 있다</b>(api-spec.md §4). 비로그인은 {@code PUBLIC}만,
	 * 로그인은 {@code PUBLIC} + 본인 소유 비공개까지 본다. 규칙에 안 맞으면 빈 결과이고 서비스가
	 * 404로 바꾼다 — 403이 아니다(존재 여부 자체를 흘리지 않는다).
	 *
	 * <p><b>{@code :userId is not null}을 명시한다</b> — {@code placement.user}는 탈퇴로 NULL이 될 수
	 * 있어서, 3값 논리에 맡기면 "주인 없는 비공개 배치"가 익명 호출자에게 열릴 여지가 남는다
	 * ({@code placement/CLAUDE.md}).
	 *
	 * <p>조건이 정적이라 QueryDSL로 올라가지 않는다 — {@code userId}가 NULL이어도 이 식은 그대로
	 * 성립한다(빠지는 조건이 없어 null-guard가 아니다, querydsl-rubric §1·§3).
	 */
	@Query("""
			select p from Placement p
				left join fetch p.desk
				left join fetch p.items
			where p.id = :id
				and p.deletedAt is null
				and (p.publishStatus = com.brunchies.dero.placement.PublishStatus.PUBLIC
					or (:userId is not null and p.user.id = :userId))
			""")
	Optional<Placement> findVisibleById(@Param("id") Long id, @Param("userId") Long userId);

	/**
	 * 게시글 본문 {@code [[placement:ID]]} 토큰의 삽입 게이트(ADR-0013 결정 3) — 주어진 id 중
	 * <b>{@code userId} 소유이면서 {@code PUBLIC}</b>인 것만 돌려준다. 호출부는 요청 id 집합과
	 * 비교해 빠진 것이 있으면 거부한다.
	 *
	 * <p><b>id 스칼라만 읽는다</b> — 존재 여부 판정이 전부라 엔티티를 끌어올 이유가 없다.
	 * DTO 생성자 프로젝션이 아니므로 ADR-0018 결정 1의 금지 대상이 아니다.
	 *
	 * <p>조건이 전부 정적이라 QueryDSL로 올라가지 않는다(빠지는 술어가 없다).
	 */
	@Query("""
			select p.id from Placement p
			where p.id in :ids
				and p.deletedAt is null
				and p.user.id = :userId
				and p.publishStatus = com.brunchies.dero.placement.PublishStatus.PUBLIC
			""")
	List<Long> findEmbeddableIds(
			@Param("ids") Collection<Long> ids, @Param("userId") Long userId);

	/**
	 * 호출자가 북마크한 배치 — {@code (placement_id, 살아 있는 그룹 id)} 쌍이다. 목록 응답의
	 * {@code isBookmarked}·{@code bookmarkGroupId}를 <b>페이지의 id 묶음 하나로</b> 채운다.
	 *
	 * <p><b>네이티브 SQL인 이유는 성능이 아니라 의존 방향이다.</b> {@code placement_bookmark}는
	 * {@code community} 애그리거트인데 {@code placement}는 그 위 계층을 알 수 없다(ADR-0007 결정 7,
	 * {@code LayerDependencyTest}). JPQL·QueryDSL로 쓰면 {@code PlacementBookmark}·
	 * {@code QPlacementBookmark}를 import하게 되어 역류다. 읽기는 애그리거트 경계를 넘어도 되므로
	 * (ADR-0007) 자바 타입 의존 없이 테이블만 읽는다. <b>대가: 저쪽 테이블·컬럼을 고치면 여기가
	 * 컴파일 에러 없이 런타임에 깨진다</b> — {@code community/PlacementBookmark}를 손볼 땐 이 두
	 * 쿼리를 같이 봐야 한다.
	 *
	 * <p>반환이 {@code Object[]}인 이유: 네이티브 쿼리는 생성자 표현식을 못 쓰고, 인터페이스
	 * 프로젝션은 별칭 대소문자 처리가 DB·드라이버에 달려 있다. 두 컬럼짜리 조회 하나에
	 * {@code @SqlResultSetMapping}을 다는 것보다 호출부에서 {@code Number}로 읽는 쪽이 싸다.
	 *
	 * <p>{@code placementIds}가 비면 부르지 않는다 — 빈 {@code in} 목록은 SQL로 성립하지 않는다.
	 */
	@Query(value = """
			select b.placement_id, case when g.deleted_at is null then g.id end
			from placement_bookmark b
				left join placement_bookmark_group g on g.id = b.placement_bookmark_group_id
			where b.user_id = :userId
				and b.placement_id in (:placementIds)
			""", nativeQuery = true)
	List<Object[]> findBookmarkRows(
			@Param("userId") Long userId, @Param("placementIds") List<Long> placementIds);

	/**
	 * {@code ?bookmarked=me} 필터의 입력 — 호출자가 북마크한 배치 <b>전부</b>의
	 * {@code (placement_id, 살아 있는 그룹 id)}다. 네이티브인 사유는 {@link #findBookmarkRows}와 같다.
	 *
	 * <p><b>페이지 크기와 무관하게 사용자의 북마크를 전부 읽는다.</b> 그룹 필터가 배치 목록 쿼리
	 * 안으로 못 들어가서(같은 의존 방향 문제) id 목록으로 넘기기 때문이다 — 한 사람이 담는 북마크
	 * 수가 커지면 이 자리가 먼저 아프다. 그때는 두 도메인을 잇는 읽기 전용 뷰나 검색 인덱스가
	 * 답이지 이 쿼리를 페이지네이션하는 것이 아니다.
	 */
	@Query(value = """
			select b.placement_id, case when g.deleted_at is null then g.id end
			from placement_bookmark b
				left join placement_bookmark_group g on g.id = b.placement_bookmark_group_id
			where b.user_id = :userId
			""", nativeQuery = true)
	List<Object[]> findAllBookmarkRows(@Param("userId") Long userId);

	/**
	 * 목록 카드 표지 — 배치별 <b>대표 상상도</b>의 {@code (placement_id, image_key)}다(ADR-0015 결정
	 * 6·7). 업로드 전 배치는 행이 없고, 그때 표지는 프론트가 폴백으로 그린다.
	 *
	 * <p><b>네이티브 SQL인 사유는 {@link #findBookmarkRows}와 같다</b> — {@code generated_image}는
	 * {@code image} 애그리거트인데 {@code placement}는 그 위 계층을 알 수 없어(ADR-0007 결정 7,
	 * {@code LayerDependencyTest}) {@code GeneratedImage}를 import하면 역류다. 같은 대가도 그대로
	 * 진다: 저쪽 테이블·컬럼을 고치면 여기가 컴파일 에러 없이 런타임에 깨진다.
	 *
	 * <p>배치당 대표가 <b>최대 1행</b>인 것은 부분 유니크 인덱스
	 * {@code uq_generated_image_placement_id ... WHERE is_primary}가 보장하고, 그 인덱스가 이 조회의
	 * 인덱스이기도 하다(ADR-0015 결정 6).
	 *
	 * <p>{@code placementIds}가 비면 부르지 않는다 — 빈 {@code in} 목록은 SQL로 성립하지 않는다.
	 */
	@Query(value = """
			select placement_id, image_key
			from generated_image
			where is_primary and placement_id in (:placementIds)
			""", nativeQuery = true)
	List<Object[]> findPrimaryImageRows(@Param("placementIds") List<Long> placementIds);

	/**
	 * 견적 합계(REQ-REC-01)의 절반 — 배치에 놓인 <b>아이템</b> 가격의 합을 배치별로. 책상은 여기 없다
	 * ({@code placement_desk}는 다른 테이블이고 직접 입력 모드는 제품이 아니다, D18) —
	 * {@link #findDeskPriceRows}가 나머지 절반이고, 둘을 합치는 자리는
	 * {@link com.brunchies.dero.placement.service.PlacementEstimateService#totalPriceKrwByIds}
	 * 하나뿐이다.
	 *
	 * <p><b>id 하나짜리 조회도 이 배치(batch) 메서드를 쓴다</b> — 상세 견적과 목록이 각자 합계를 세면
	 * 같은 배치가 화면마다 다른 금액을 말한다. 목록은 페이지의 id 묶음으로 한 번에 읽는다(카드마다
	 * 물으면 N+1이라 북마크·대표 상상도와 같은 형태다).
	 *
	 * <p><b>가시성은 이 쿼리가 판정하지 않는다</b> — 호출 전에 {@link #findVisibleById}(상세) 또는
	 * 목록 쿼리의 {@code visibleTo}가 게이트를 통과시킨다. 조건을 여기에도 복사하면 두 벌이 되고
	 * 한쪽만 고쳐지는 날이 온다.
	 *
	 * <p><b>수량 컬럼이 없다</b> — 인스턴스 1개가 행 1개라 같은 제품이 둘이면 {@code sum}이 두 번
	 * 더한다. 그게 요구사항이다(모니터 2대 세팅).
	 *
	 * <p>{@code price_krw}가 NULL인 제품(자작 제품 등)은 {@code sum}이 건너뛴다. 아이템이 하나도 없는
	 * 배치는 <b>행 자체가 없다</b>(그룹이 안 생긴다) — 호출자가 0으로 채운다.
	 */
	@Query("""
			select i.placement.id, coalesce(sum(pr.priceKrw), 0L)
			from PlacedItem i
				join i.product pr
			where i.placement.id in :placementIds
			group by i.placement.id
			""")
	List<Object[]> findItemPriceSumRows(@Param("placementIds") List<Long> placementIds);

	/**
	 * 견적 합계의 나머지 절반 — 배치별 책상 가격. <b>직접 입력 규격 책상은 0이다</b>(D18): 카탈로그
	 * 제품이 아니라 줄자로 잰 수치라 살 대상이 아니다. 그래서 {@code specSource}로 좁히고,
	 * 제품 모드인데 가격이 미등록이면 {@code coalesce}가 0으로 내린다.
	 *
	 * <p>{@code left join}이어야 한다 — 암시적 경로 조인({@code d.product.priceKrw})은 INNER라
	 * 제품이 NULL인 행이 통째로 사라진다.
	 */
	@Query("""
			select d.placement.id, coalesce(pr.priceKrw, 0)
			from PlacementDesk d
				left join d.product pr
			where d.placement.id in :placementIds
				and d.specSource = :specSource
			""")
	List<Object[]> findDeskPriceRows(@Param("placementIds") List<Long> placementIds,
			@Param("specSource") SpecSource specSource);

	/**
	 * 전량 재색인의 원천(ADR-0019 결정 3). <b>소프트 삭제만 거른다 —
	 * {@link com.brunchies.dero.placement.PublishStatus}로 좁히지 않는다</b>: 색인은 전량이고 노출
	 * 판정은 Postgres가 한다(ADR-0027 결정 4).
	 *
	 * <p>해시태그는 <b>일부러 {@code join fetch}하지 않는다</b> — 컬렉션이라 문서마다 행이 곱해지고,
	 * {@code default_batch_fetch_size = 100}이 어차피 {@code IN} 한 방으로 묶어 읽는다. 작성자는
	 * to-one이라 같이 끌어온다.
	 */
	@Query("""
			select p from Placement p
				left join fetch p.user
			where p.deletedAt is null
			order by p.id
			""")
	List<Placement> findAllForIndexing();
}
