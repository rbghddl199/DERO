package com.brunchies.dero.placement;

import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.Hashtag;
import com.brunchies.dero.global.entity.BaseSoftDeleteEntity;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.placement.dto.FloorSnapshot;
import com.brunchies.dero.placement.dto.ItemSnapshot;
import com.brunchies.dero.placement.dto.WallSnapshot;
import com.brunchies.dero.product.Desk;
import com.brunchies.dero.product.FrameType;
import com.brunchies.dero.product.Product;
import com.brunchies.dero.user.User;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 배치 애그리거트 루트. 배치·템플릿·공개 배치를 <b>테이블 하나 + 상태 컬럼</b>으로 표현한다
 * (별도 테이블을 만들지 않는다). 감사 3종.
 *
 * <p><b>{@code placement_desk}·{@code placed_item}은 이 애그리거트 <u>안</u>이다</b>(ADR-0007) —
 * 그래서 이 두 연관에만 {@code cascade = ALL} + {@code orphanRemoval}을 건다. 쓰기가 전부 루트를
 * 통과하므로 {@code PlacedItemRepository}·{@code PlacementDeskRepository}를 만들지 않는다.
 * 반대로 {@code user}는 다른 루트라 {@code cascade}가 없다.
 *
 * <p><b>벽 3면 토글과 방 조명은 배치 저장 값이다</b>(D4, 2026-07-23). 저장하지 않으면 REQ-SIM-06
 * 이후 벽 구성이 복원되지 않아 꺼진 벽에 타공판이 떠 있는 상태가 재현되고(REQ-ENV-04 위반), 조명을
 * 빠뜨리면 저장한 무드와 재로드한 무드가 달라진다(REQ-SIM-08 Must).
 */
@Entity
@Table(name = "placement")
@SequenceGenerator(name = "placement_seq", sequenceName = "placement_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Placement extends BaseSoftDeleteEntity {

	/** 요청이 바닥 마감을 생략했을 때의 기본 계열 — DDL {@code DEFAULT 'WOOD'}와 같은 값이다(ADR-0030). */
	public static final String DEFAULT_FLOOR_MATERIAL = "WOOD";

	/** {@link #DEFAULT_FLOOR_MATERIAL}의 기본 변형 — DDL {@code DEFAULT 'OAK'}와 같은 값이다. */
	public static final String DEFAULT_FLOOR_VARIANT = "OAK";

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "placement_seq")
  private Long id;

  /**
   * 작성자. <b>{@code ON DELETE SET NULL}이라 nullable이다</b> — 작성자가 탈퇴해도 공개 배치는
   * 커뮤니티에 남는다. 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다.
   */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id")
  private User user;

  /**
   * 리믹스 출처. <b>원본 배치는 출처가 없으므로 NULL이다.</b> 자기참조지만 다른 배치는 별개의
   * 애그리거트라 {@code cascade}를 걸지 않는다 — 걸면 리믹스본을 지울 때 원본까지 번진다.
   */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "source_placement_id")
  private Placement sourcePlacement;

  /** 관리자 시딩 템플릿 구분(REQ-COM-02). */
  @Column(name = "is_template", nullable = false)
  private boolean isTemplate;

  @Column(name = "title", nullable = false, length = 100)
  private String title;

  /**
   * 배치 설명. <b>2026-07-30 {@code VARCHAR(255)}에서 {@code TEXT}로 승격했다</b>(ADR-0013 결정 7,
   * D25 — 글 양이 많아진다). {@code Comment.content}와 같은 이유로 {@code length}를 주지 않는다 —
   * 길이를 주면 {@code VARCHAR(255)}로 매핑돼 {@code ddl-auto: validate}가 타입 불일치로 부팅을
   * 죽인다.
   */
  @Column(name = "description", columnDefinition = "TEXT")
  private String description;

  /**
   * 게시 상태(ADR-0015 결정 1). <b>데스크 피드 노출은 {@link PublishStatus#PUBLIC} 하나뿐</b>이고
   * {@link PublishStatus#PUBLIC}·{@link PublishStatus#FAILED}는 서버만 정한다.
   */
  @Enumerated(EnumType.STRING)
  @Column(name = "publish_status", nullable = false, length = 10)
  private PublishStatus publishStatus;

  /**
   * {@code placement_like} 행 수의 집계 캐시다 — 목록을 인기순으로 정렬할 때
   * ({@code idx_placement_publish_status_like_count}) 매번 세지 않기 위해 둔다. 정본은 여전히
   * {@code placement_like} 테이블이고 이 값은 파생이다.
   */
  @Column(name = "like_count", nullable = false)
  private int likeCount;

  /** 방 조명(전역 중립 리그) on/off. 끄면 배치 조명만 남는 무드 모드다. */
  @Column(name = "is_room_light_on", nullable = false)
  private boolean isRoomLightOn;

	/**
	 * 바닥 재질 계열(ADR-0030). <b>바닥은 면이 하나라 테이블을 만들지 않는다</b> — 벽은 3면
	 * 반복이라 {@code placement_wall}이다. 값 방침은 {@link PlacementWall#getMaterial()}과 같다
	 * (형식만 검증, 화이트리스트 없음).
	 */
	@Column(name = "floor_material", nullable = false, length = 30)
	private String floorMaterial;

	@Column(name = "floor_variant", nullable = false, length = 30)
	private String floorVariant;

	/**
	 * 방 무드 시간대(ADR-0030 결정 4, D31). <b>{@code isRoomLightOn}과 별개 값이다</b> — 시간대를
	 * 바꾸면 프론트가 방 조명을 기본값으로 함께 움직이지만(DAY→on, NIGHT→off) 사용자가 그 뒤 따로
	 * 토글할 수 있다. 병합하면 "자연광만 드는 아침"·"천장등 켠 밤" 조합이 사라진다.
	 */
	@Enumerated(EnumType.STRING)
	@Column(name = "time_of_day", nullable = false, length = 10)
	private TimeOfDay timeOfDay;

  /**
   * 사용자가 입력한 예산(REQ-ENV-02). <b>NULL = 예산 미입력</b>이고 예산을 안 정한 배치가 정상이다.
   * 견적 <b>스냅샷이 아니다</b> — 총액은 매번 {@code placed_item} + {@code product.price_krw}로
   * 계산한다. 여기 저장하는 것은 "초과/여유" 표시를 복원할 기준선 한 줄뿐이다.
   */
  @Column(name = "budget_krw")
  private Integer budgetKrw;

  /**
   * 시뮬레이터 캔버스 스크린샷의 object key. <b>생성 직후엔 NULL이고 캡처 후에 값이 생긴다.</b>
   * 2단계 presign으로만 채워지며({@code POST .../thumbnail/upload-url} → {@code PUT .../thumbnail})
   * 파일 서빙 엔드포인트를 만들지 않는다 — 상세 응답에는 presigned GET URL로 나간다.
   *
   * <p><b>AI 상상도({@code generated_image})와 다른 이미지다</b> — 이건 내 작업실 카드에 쓰이고
   * 상상도는 데스크 피드 카드에 쓰인다. 스크린샷은 저장할 때, 상상도는 업로드할 때 생긴다.
   */
  @Column(name = "thumbnail_key", length = 1024)
  private String thumbnailKey;

  /**
   * 낙관적 락(ADR-0009 결정 4). 배치 저장은 씬 전체 스냅샷이라 두 탭이 같은 배치를 열면 나중
   * 저장이 앞 저장을 <b>통째로</b> 덮는다 — 그걸 감지해 409 + 재로드로 돌리는 유일한 장치다.
   *
   * <p><b>{@code placement_desk}·{@code placed_item}엔 두지 않는다</b>: 둘은 이 애그리거트 안이고
   * 쓰기가 루트를 통과하므로 루트의 {@code version} 하나가 전체를 지킨다. 자식마다 붙이면 잠금
   * 단위가 쪼개져 "책상만 바뀐 저장"이 충돌을 못 잡는다.
   *
   * <p>값은 JPA가 관리한다 — 정적 팩터리에서 채우지 않는다.
   */
  @Version
  @Column(name = "version", nullable = false)
  private Long version;

  /**
   * 배치당 정확히 1행이고 {@code uq_placement_desk_placement_id}가 그걸 강제한다.
   *
   * <p><b>다중 책상은 채택하지 않았다</b>(2026-07-24 확정) — 기획은 여전히 책상 1개다. 컬럼 블록이
   * 아니라 테이블로 뺀 이유는 그날이 오면 유니크만 {@code DROP}하면 스키마가 N개를 받기 때문이다.
   */
  @OneToOne(mappedBy = "placement", fetch = FetchType.LAZY, cascade = CascadeType.ALL,
      orphanRemoval = true)
  private PlacementDesk desk;

  /**
   * 배치에 놓인 인스턴스들. <b>인스턴스 1개 = 행 1개</b>라 수량 컬럼이 없다.
   *
   * <p>필드 초기화를 살리려고 {@link Builder}를 클래스가 아니라 <b>생성자</b>에 붙였다 —
   * 클래스 레벨 {@code @Builder}는 이 초기화를 {@code @Builder.Default}로 옮겨 가므로 JPA가 쓰는
   * 기본 생성자 경로에서 컬렉션이 NULL이 된다.
   */
  @OneToMany(mappedBy = "placement", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<PlacedItem> items = new ArrayList<>();

	/**
	 * 벽면 3면(ADR-0030). <b>배치당 정확히 3행</b>이고 저장은 통째 교체가 아니라
	 * {@link #applyWalls}의 면 매칭 제자리 수정이다 — 저장마다 행 id가 바뀌지 않는다.
	 */
	@OneToMany(mappedBy = "placement", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<PlacementWall> walls = new ArrayList<>();

  /**
   * 해시태그 정션(ADR-0027 결정 5). {@code post_hashtag}가 {@code Post} 안인 것과 같이 이것도
   * {@link Placement} 안이라 {@code PlacementHashtagRepository}를 만들지 않는다.
   *
   * <p><b>값이 들어오는 자리는 공개 전환 하나다</b> — 스냅샷 저장({@code PUT /placements/{id}})은
   * 태그를 받지 않는다. {@code PRIVATE} 배치의 태그는 아무도 못 보기 때문이다.
   */
  @OneToMany(mappedBy = "placement", cascade = CascadeType.ALL, orphanRemoval = true)
  private List<PlacementHashtag> hashtags = new ArrayList<>();

  @Builder(access = AccessLevel.PRIVATE)
  private Placement(User user, Placement sourcePlacement, boolean isTemplate, String title,
      String description, PublishStatus publishStatus, boolean isRoomLightOn, String floorMaterial,
      String floorVariant, TimeOfDay timeOfDay, Integer budgetKrw) {
    this.user = user;
    this.sourcePlacement = sourcePlacement;
    this.isTemplate = isTemplate;
    this.title = title;
    this.description = description;
    this.publishStatus = publishStatus;
    this.isRoomLightOn = isRoomLightOn;
    this.floorMaterial = floorMaterial;
    this.floorVariant = floorVariant;
    this.timeOfDay = timeOfDay;
    this.budgetKrw = budgetKrw;
  }

  /**
   * 새 배치. 규격 서브타입의 boolean과 달리 <b>여기는 기본값을 채운다</b> — "아직 아님"이 곧
   * {@code false}인 값이라 미입력이 곧 정답이고, 둔갑 문제가 없다.
   *
   * <p>{@code publishStatus}는 DDL 기본값과 같은 {@link PublishStatus#PRIVATE}로 시작한다 — 공개는
   * 판정을 통과해야 하는 별도 행위다(ADR-0009 결정 5, ADR-0015 결정 9). {@code likeCount}·
   * {@code version}은 각각 집계 캐시와 JPA 관리값이라 여기서 채우지 않는다.
   */
  public static Placement create(User user, String title, String description, Integer budgetKrw) {
    Placement placement = Placement.builder()
        .user(user)
        .title(title)
        .description(description)
        .budgetKrw(budgetKrw)
        .publishStatus(PublishStatus.PRIVATE)
        .isTemplate(false)
        .isRoomLightOn(true)
        .floorMaterial(DEFAULT_FLOOR_MATERIAL)
        .floorVariant(DEFAULT_FLOOR_VARIANT)
        .timeOfDay(TimeOfDay.DAY)
        .build();
    placement.seedDefaultWalls();
    return placement;
  }

	/**
	 * 벽면 3행을 기본 마감으로 시드한다 — "배치당 정확히 3행" 불변이 저장 경로 하나가 아니라
	 * 생성 자체에 실리게 한다({@code create()}가 바닥·시간대 기본값을 채우는 것과 같은 결).
	 * 스냅샷 저장은 이 행들을 {@link #applyWalls}로 제자리 수정한다.
	 */
	private void seedDefaultWalls() {
		for (WallSide side : WallSide.values()) {
			walls.add(defaultWall(side, side != WallSide.RIGHT));
		}
	}

	private PlacementWall defaultWall(WallSide side, boolean isOn) {
		int distanceMm = side == WallSide.FRONT
				? PlacementWall.DEFAULT_FRONT_DISTANCE_MM
				: PlacementWall.DEFAULT_SIDE_DISTANCE_MM;
		return PlacementWall.create(this, side, isOn, distanceMm, PlacementWall.DEFAULT_MATERIAL,
				PlacementWall.DEFAULT_VARIANT, false, null, null, null, null);
	}

	/**
	 * 씬 스냅샷의 배치 속성을 반영한다(ADR-0009 결정 1 — 매 저장이 씬 전체다). 영속 엔티티라 dirty
	 * checking이 UPDATE를 낸다 — 빌더로 재조립하지 않는다(규칙 13).
	 *
	 * <p><b>{@code publishStatus}는 여기서 안 받는다</b>(ADR-0015 결정 10). {@code PENDING}·
	 * {@code PUBLIC}·{@code FAILED}는 서버만 정하는 값이라 스냅샷이 게시 상태를 실어 오면 클라이언트가
	 * 업로드 큐를 우회해 바로 공개할 수 있다. 공개 전이는 {@code PUT /placements/{id}/feed-entry}가
	 * 맡는다.
	 */
	public void updateScene(String title, String description, boolean isRoomLightOn,
			Integer budgetKrw) {
		this.title = title;
		this.description = description;
		this.isRoomLightOn = isRoomLightOn;
		this.budgetKrw = budgetKrw;
	}

	/**
	 * 바닥 마감을 반영한다. <b>생략(null)은 "기존 유지"다</b> — 마감을 모르는 옛 클라이언트의
	 * 저장이 V8 백필·신규 저장된 바닥을 기본값으로 되돌리면 안 된다(무회귀). 스냅샷의 다른
	 * 필드처럼 생략을 기본값으로 접지 않는 이유가 이것이다.
	 */
	public void applyFloor(FloorSnapshot floor) {
		if (floor == null) {
			return;
		}
		floor.validate();
		this.floorMaterial = floor.material();
		this.floorVariant = floor.variant();
	}

	/** 시간대 반영. 생략(null)이 "기존 유지"인 사유는 {@link #applyFloor}와 같다. */
	public void applyTimeOfDay(TimeOfDay timeOfDay) {
		if (timeOfDay == null) {
			return;
		}
		this.timeOfDay = timeOfDay;
	}

	/**
	 * 벽면 3면을 반영한다 — <b>면 매칭 제자리 수정</b>이다({@link #mergeItems}의 id 매칭과 같은
	 * 이유: 저장마다 행 id가 바뀌면 안 된다). 면은 좌·전면·우 3개 고정이라 삭제 갈래가 없다.
	 * 호출자({@code PlacementSnapshotRequest.resolveWalls})가 3면 전부를 검증해 넘긴다.
	 */
	public void applyWalls(List<WallSnapshot> snapshots) {
		Map<WallSide, PlacementWall> bySide = walls.stream()
				.collect(Collectors.toMap(PlacementWall::getWallSide, wall -> wall));
		for (WallSnapshot snapshot : snapshots) {
			PlacementWall wall = bySide.get(snapshot.wallSide());
			if (wall == null) {
				walls.add(PlacementWall.create(this, snapshot.wallSide(), snapshot.isOn(),
						snapshot.distanceMm(), snapshot.material(), snapshot.variant(),
						snapshot.hasWindow(), snapshot.windowCenterXMm(), snapshot.windowCenterYMm(),
						snapshot.windowWidthMm(), snapshot.windowHeightMm()));
			} else {
				wall.apply(snapshot.isOn(), snapshot.distanceMm(), snapshot.material(),
						snapshot.variant(), snapshot.hasWindow(), snapshot.windowCenterXMm(),
						snapshot.windowCenterYMm(), snapshot.windowWidthMm(),
						snapshot.windowHeightMm());
			}
		}
	}

	/**
	 * 해시태그 집합을 통째로 맞춘다. <b>{@code clear()} + {@code addAll()}이 아니라 diff다</b> —
	 * Hibernate는 한 flush 안에서 INSERT를 DELETE보다 먼저 내므로, 기존 원소가 남는 교체를
	 * clear+addAll로 쓰면 옛 행이 살아 있는 채로 같은 쌍을 INSERT해
	 * {@code uq_placement_hashtag_placement_id_hashtag_id}에 걸려 죽는다({@code Post.replaceHashtags}와
	 * 같은 자리다 — 겹치지 않는 교체로만 테스트하면 안 보인다).
	 */
	public void replaceHashtags(List<Hashtag> targets) {
		Set<Long> targetIds = targets.stream().map(Hashtag::getId).collect(Collectors.toSet());
		hashtags.removeIf(junction -> !targetIds.contains(junction.getHashtag().getId()));

		Set<Long> keptIds = hashtags.stream()
				.map(junction -> junction.getHashtag().getId())
				.collect(Collectors.toSet());
		for (Hashtag hashtag : targets) {
			if (keptIds.add(hashtag.getId())) {
				hashtags.add(PlacementHashtag.create(this, hashtag));
			}
		}
	}

	/** 배치당 정확히 1행인 책상을 붙인다. 이미 있으면 {@link PlacementDesk#apply}가 제자리 수정한다. */
	public void attachDesk(PlacementDesk desk) {
		this.desk = desk;
	}

	/**
	 * 업로드가 끝난 스크린샷 key를 등록한다. <b>재등록은 덮어쓴다</b> — key가 배치마다 결정론적이라
	 * 같은 자리에 새 파일이 올라간다.
	 *
	 * <p><b>이미 영속화된 배치에는 부르지 마라 — 아직 저장 전인 배치를 조립할 때만 쓴다.</b> 영속
	 * 엔티티에 부르면 dirty checking이 {@code @Version}을 올려, 클라이언트가 모르는 새 낙관적 락
	 * 계약이 깨지고 다음 저장이 영원히 409가 된다. 등록 API({@code PUT /placements/{id}/thumbnail})는
	 * 그래서 {@link com.brunchies.dero.placement.repository.PlacementRepository#updateThumbnailKey}
	 * 벌크 UPDATE를 쓴다.
	 */
	public void registerThumbnail(String thumbnailKey) {
		this.thumbnailKey = thumbnailKey;
	}

	/**
	 * 운영진 시딩 템플릿으로 지정한다({@code PUT /admin/placements/{id}/template}). <b>게시 상태를
	 * 건드리지 않는다</b> — 템플릿은 "이 배치가 시드다"라는 표시일 뿐이고 피드 노출은 여전히
	 * {@link PublishStatus#PUBLIC} 하나가 정한다(ADR-0015 결정 1). 여기서 같이 공개해 버리면
	 * 상상도 없는 배치가 게이트를 우회해 피드에 걸린다.
	 */
	public void markAsTemplate() {
		this.isTemplate = true;
	}

	/** 템플릿 해제({@code DELETE /admin/placements/{id}/template}). 멱등이라 재호출이 안전하다. */
	public void unmarkAsTemplate() {
		this.isTemplate = false;
	}

	/**
	 * 데스크 피드 공개 요청 — {@code PENDING}으로 올린다(ADR-0015 결정 1). 게이트(판정·스크린샷·한도)는
	 * 이 메서드를 부르기 <b>전에</b> 통과해 있어야 한다 — 엔티티는 리포지토리를 모르므로 한도 카운트도
	 * 판정 대상 규격도 여기서 볼 수 없다.
	 *
	 * <p>{@code PUBLIC}에서 다시 불러도 {@code PENDING}으로 내려간다 — 사용자가 <b>명시적으로</b> 다시
	 * 업로드를 누른 경우다. 배치를 고쳤다고 자동으로 재생성하지는 않는다(ADR-0015 결정 11).
	 */
	public void requestFeedEntry() {
		this.publishStatus = PublishStatus.PENDING;
	}

	/** 공개 취소 — 피드에서 내리고 내 작업실로 되돌린다({@code DELETE .../feed-entry}). */
	public void withdrawFeedEntry() {
		this.publishStatus = PublishStatus.PRIVATE;
	}

	/** 상상도가 붙었다 → 피드 노출. <b>서버만 정하는 전이다</b>(ADR-0015 결정 1). */
	public void markPublished() {
		this.publishStatus = PublishStatus.PUBLIC;
	}

	/** 상상도 생성 실패 → 재업로드 대상. <b>서버만 정하는 전이다.</b> */
	public void markFailed() {
		this.publishStatus = PublishStatus.FAILED;
	}

	/**
	 * 이미 큐에 들어가 있는가. {@code PUT}은 멱등이라 {@code PENDING}에 다시 부르는 것이 정상 경로인데,
	 * 그때마다 재투입하면 같은 배치의 상상도가 두 번 쓰여 대표 1행 부분 유니크가 막는다.
	 */
	public boolean isFeedEntryQueued() {
		return publishStatus == PublishStatus.PENDING;
	}

	/**
	 * 이 배치의 소유자인가. <b>양쪽 NULL을 다 검사한다</b> — {@code placement.user}는
	 * {@code ON DELETE SET NULL}이라 탈퇴 후 NULL이고 비로그인 {@code userId}도 NULL이라, 한쪽만
	 * 검사하면 익명 호출자가 주인 없는 배치의 주인으로 통과한다({@code placement/CLAUDE.md}).
	 */
	public boolean isOwnedBy(Long userId) {
		return userId != null && user != null && userId.equals(user.getId());
	}

	/**
	 * 씬 스냅샷의 아이템 목록을 반영한다 — <b>id 매칭 병합</b>(ADR-0009 결정 2). {@code id}가 있으면
	 * UPDATE, 없으면 INSERT, 요청에 안 온 id는 DELETE다. 통째 교체가 아닌 이유는 저장마다
	 * {@code placed_item.id}가 바뀌면 아이템 단위 외부 참조(댓글·핀)를 붙일 수 없기 때문이다.
	 *
	 * <p><b>{@code orderedItems}는 "물릴 대상이 앞"으로 정렬돼 있어야 한다</b> — PostgreSQL FK가
	 * {@code NOT DEFERRABLE}이라 자식 행이 부모보다 먼저 INSERT되면 그 자리에서 위반이다(ADR-0009
	 * 결정 8). 정렬과 {@code ref} 검증은 서비스가 끝내고 들어온다.
	 *
	 * @return {@code ref} → 반영된 아이템. 저장 후 {@code ref → id} 응답을 만드는 데 쓴다.
	 */
	public Map<String, PlacedItem> mergeItems(List<ItemSnapshot> orderedItems,
			Map<Long, Product> productsById) {
		Set<Long> keptIds = orderedItems.stream()
				.map(ItemSnapshot::id)
				.filter(Objects::nonNull)
				.collect(Collectors.toSet());
		Set<Long> ownedIds = items.stream().map(PlacedItem::getId).collect(Collectors.toSet());
		if (!ownedIds.containsAll(keptIds)) {
			// 남의 배치 아이템 id를 끼워 넣은 요청은 형식 오류가 아니라 권한 침범이다(ADR-0009 결정 7).
			// 어느 id인지 적지 않는다 — 존재 여부를 되돌려 주지 않기 위해서다.
			throw new BusinessException(PlacementErrorCode.PLACEMENT_ITEM_NOT_OWNED);
		}

		// 지우기 전에 결합을 전부 끊는다 — fk_placed_item_mounted_to_placed_item_id가 NO ACTION이라
		// 물린 쪽을 남긴 채 암을 지우면 FK 위반이다. 살아남는 아이템의 결합은 아래 루프가 다시 세우고,
		// dirty checking은 flush 시점의 최종 상태만 보므로 그 왕복은 UPDATE를 내지 않는다.
		items.forEach(PlacedItem::unmount);
		items.removeIf(item -> !keptIds.contains(item.getId()));

		Map<Long, PlacedItem> existingById =
				items.stream().collect(Collectors.toMap(PlacedItem::getId, item -> item));
		Map<String, PlacedItem> byRef = new HashMap<>();
		for (ItemSnapshot snapshot : orderedItems) {
			Product product = productsById.get(snapshot.productId());
			PlacedItem item = snapshot.id() == null
					? insertItem(snapshot, product)
					: updateItem(existingById.get(snapshot.id()), snapshot, product);
			if (snapshot.mountedToRef() != null) {
				item.mountVesaTo(byRef.get(snapshot.mountedToRef()));
			}
			byRef.put(snapshot.ref(), item);
		}
		return byRef;
	}

	private PlacedItem insertItem(ItemSnapshot snapshot, Product product) {
		PlacedItem item = PlacedItem.create(this, product, snapshot.positionXMm(),
				snapshot.positionYMm(), snapshot.positionZMm(), snapshot.rotationDeg(),
				snapshot.pitchDegOrZero(), snapshot.surfaceType(), snapshot.wallSide(),
				snapshot.jointValues(), snapshot.emitterColor());
		items.add(item);
		return item;
	}

	private PlacedItem updateItem(PlacedItem item, ItemSnapshot snapshot, Product product) {
		item.update(product, snapshot.positionXMm(), snapshot.positionYMm(), snapshot.positionZMm(),
				snapshot.rotationDeg(), snapshot.pitchDegOrZero(), snapshot.surfaceType(),
				snapshot.wallSide(), snapshot.jointValues(), snapshot.emitterColor());
		return item;
	}

	/**
	 * 리믹스 — 원본을 <b>서버가</b> 통째로 복사한다(REQ-COM-02·03). 클라이언트가 상세를 받아
	 * 재조립해 {@code POST /placements}로 보내는 방식을 쓰지 않는 이유는 출처가 자기 신고가 되기
	 * 때문이다: {@code sourcePlacement}를 여기서만 채운다.
	 *
	 * <p>복사본은 <b>호출자 소유·{@link PublishStatus#PRIVATE}</b>다. 공개는 판정을 통과해야 하는
	 * 별도 행위이므로 원본이 {@code PUBLIC}이어도 그대로 물려주지 않는다(ADR-0015 결정 9).
	 * {@code likeCount}·{@code thumbnailKey}·상상도도 물려주지 않는다 — 남의 반응과 남이 찍은
	 * 스크린샷이지 내 배치의 것이 아니다(스크린샷·상상도는 애초에 이 애그리거트 밖이다).
	 *
	 * <p><b>결합({@code mountedToRef})은 복사본끼리 잇는다</b> — 원본 아이템 id를 그대로 베끼면
	 * 복사본의 모니터가 원본의 암에 물린 채로 저장돼 두 배치가 한 그래프로 엮인다. 재매핑이
	 * 서버의 이 한 곳에서만 일어나야 하는 이유다.
	 */
	public static Placement copyOf(User owner, Placement source) {
		Placement copy = Placement.builder()
				.user(owner)
				.sourcePlacement(source)
				.isTemplate(false)
				.title(source.title)
				.description(source.description)
				.publishStatus(PublishStatus.PRIVATE)
				.isRoomLightOn(source.isRoomLightOn)
				.floorMaterial(source.floorMaterial)
				.floorVariant(source.floorVariant)
				.timeOfDay(source.timeOfDay)
				.budgetKrw(source.budgetKrw)
				.build();

		if (source.desk != null) {
			copy.desk = source.desk.copyInto(copy);
		}

		// 벽면 마감·창문도 방 룩이다 — 안 물려주면 복사본이 다른 방이 된다(ADR-0030).
		for (PlacementWall sourceWall : source.walls) {
			copy.walls.add(sourceWall.copyInto(copy));
		}

		Map<Long, PlacedItem> copiedBySourceId = new HashMap<>();
		for (PlacedItem sourceItem : mountTargetsFirst(source.items)) {
			PlacedItem copied = sourceItem.copyInto(copy);
			copy.items.add(copied);
			copiedBySourceId.put(sourceItem.getId(), copied);
			PlacedItem sourceTarget = sourceItem.getMountedToPlacedItem();
			if (sourceTarget != null) {
				copied.mountVesaTo(copiedBySourceId.get(sourceTarget.getId()));
			}
		}
		return copy;
	}

	/**
	 * 물릴 대상이 앞에 오도록 정렬한다. {@code fk_placed_item_mounted_to_placed_item_id}가
	 * {@code NOT DEFERRABLE}이라 물린 쪽이 먼저 INSERT되면 그 자리에서 위반이고, Hibernate가
	 * 자기참조 INSERT 순서를 보장하는지에 걸지 않는다(ADR-0009 결정 8 — 저장 경로도 같은 이유로
	 * 서비스가 미리 정렬해서 넘긴다).
	 *
	 * <p>순환은 검사하지 않는다 — 저장 경로가 이미 막았으므로 DB에 순환 결합이 있을 수 없다.
	 */
	private static List<PlacedItem> mountTargetsFirst(List<PlacedItem> items) {
		Map<Long, PlacedItem> byId =
				items.stream().collect(Collectors.toMap(PlacedItem::getId, item -> item));
		List<PlacedItem> ordered = new ArrayList<>(items.size());
		Set<Long> placed = HashSet.newHashSet(items.size());
		for (PlacedItem item : items) {
			appendAfterMountTarget(item, byId, placed, ordered);
		}
		return ordered;
	}

	private static void appendAfterMountTarget(PlacedItem item, Map<Long, PlacedItem> byId,
			Set<Long> placed, List<PlacedItem> ordered) {
		if (!placed.add(item.getId())) {
			return;
		}
		PlacedItem target = item.getMountedToPlacedItem();
		if (target != null) {
			appendAfterMountTarget(byId.get(target.getId()), byId, placed, ordered);
		}
		ordered.add(item);
	}

}
