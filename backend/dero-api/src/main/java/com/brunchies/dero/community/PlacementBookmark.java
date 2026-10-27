package com.brunchies.dero.community;

import com.brunchies.dero.global.entity.BaseEntity;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.user.User;
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
 * 남의 공개 배치 다시 보기.
 *
 * <p><b>유니크가 {@code (user_id, placement_id)}라 한 배치는 사용자당 북마크 1건이다.</b>
 * {@code placement_bookmark_group_id}는 유니크에 들어가지 않는다 — 그룹을 바꿔도 행이 늘지 않고
 * 같은 배치를 여러 그룹에 동시에 담을 수 없다.
 *
 * <p><b>hard delete 테이블이라 {@code deleted_at}이 없다.</b> soft delete와 {@code UNIQUE}는
 * 충돌한다 — 해제한 행을 남겨두면 재북마크가
 * {@code uq_placement_bookmark_user_id_placement_id}에 막힌다. 껐다 켰다 하는 관계는 행을 지운다.
 *
 * <p><b>DDL 쪽 {@code ON DELETE} 정책이 FK마다 다르다</b> — {@code user_id}·{@code placement_id}는
 * {@code CASCADE}({@code NOT NULL}이라 {@code SET NULL}을 못 쓰고, {@code NO ACTION}이면 부모의
 * 물리 삭제 자체가 거부되어 hard delete 정의와 어긋난다), {@code placement_bookmark_group_id}는
 * {@code SET NULL}이다. 전부 DB 제약이므로 {@code cascade = CascadeType.REMOVE}로 옮겨 적지 않는다.
 *
 * <p>PK는 대리키 {@code id}다. 두 FK 조합은 복합 PK가 아니라 별도 {@code UNIQUE} 제약이다.
 */
@Entity
@Table(name = "placement_bookmark")
@SequenceGenerator(name = "placement_bookmark_seq", sequenceName = "placement_bookmark_id_seq",
    allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class PlacementBookmark extends BaseEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "placement_bookmark_seq")
  private Long id;

  /** 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다 — 걸면 저장이 경계를 넘어 번진다. */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private User user;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "placement_id", nullable = false)
  private Placement placement;

  /**
   * 담긴 그룹. <b>{@code ON DELETE SET NULL}이라 nullable이다</b> — 그룹 미지정 북마크가 정상
   * 상태이고, 그룹이 지워져도 북마크 자체는 남는다. 그룹도 별개의 애그리거트 루트라
   * {@code cascade}를 걸지 않는다.
   */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "placement_bookmark_group_id")
  private PlacementBookmarkGroup placementBookmarkGroup;

  public static PlacementBookmark create(User user, Placement placement,
      PlacementBookmarkGroup placementBookmarkGroup) {
    return PlacementBookmark.builder()
        .user(user)
        .placement(placement)
        .placementBookmarkGroup(placementBookmarkGroup)
        .build();
  }

  /**
   * 담긴 그룹을 바꾼다. 유니크가 {@code (user_id, placement_id)}라 그룹 이동은 새 행이 아니라 이
   * 행의 갱신이다 — 새로 만들면 유니크 제약에 막힌다. {@code null}을 넘기면 그룹에서 뺀다.
   */
  public void moveTo(PlacementBookmarkGroup placementBookmarkGroup) {
    this.placementBookmarkGroup = placementBookmarkGroup;
  }
}
