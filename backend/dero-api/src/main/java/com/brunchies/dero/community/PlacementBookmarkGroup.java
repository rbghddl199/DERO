package com.brunchies.dero.community;

import com.brunchies.dero.global.entity.BaseSoftDeleteEntity;
import com.brunchies.dero.user.User;
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
 * 사용자가 북마크를 묶는 단위. 감사 3종(soft delete).
 *
 * <p><b>{@link PlacementBookmark}와 별개의 애그리거트 루트다</b>(ADR-0007) — 북마크가 이 그룹을
 * NULL 허용으로 참조하므로 그룹 없는 북마크가 정상 상태다. 그래서 북마크 컬렉션을 여기에 두지
 * 않고 {@code cascade}도 걸지 않는다.
 *
 * <p>{@code user_id}는 DDL 쪽 {@code ON DELETE CASCADE}다(사용자가 물리 삭제되면 그룹도 사라진다).
 * DB 제약이므로 {@code cascade = CascadeType.REMOVE}로 옮겨 적지 않는다.
 */
@Entity
@Table(name = "placement_bookmark_group")
@SequenceGenerator(name = "placement_bookmark_group_seq",
    sequenceName = "placement_bookmark_group_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class PlacementBookmarkGroup extends BaseSoftDeleteEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "placement_bookmark_group_seq")
  private Long id;

  /** 소유자. 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다. */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private User user;

  /** 사용자가 붙인 이름. */
  @Column(name = "title", nullable = false, length = 50)
  private String title;

  @Column(name = "description", length = 255)
  private String description;

  public static PlacementBookmarkGroup create(User user, String title, String description) {
    return PlacementBookmarkGroup.builder()
        .user(user)
        .title(title)
        .description(description)
        .build();
  }

  /** 이름·설명 수정. 감사 3종이라 {@code updated_at}이 있고 이 경로로 갱신된다. */
  public void update(String title, String description) {
    this.title = title;
    this.description = description;
  }
}
