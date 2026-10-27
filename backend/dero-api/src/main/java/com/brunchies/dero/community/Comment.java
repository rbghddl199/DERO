package com.brunchies.dero.community;

import com.brunchies.dero.global.entity.BaseSoftDeleteEntity;
import com.brunchies.dero.placement.Placement;
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
 * 공개 배치에 달리는 댓글. 감사 3종(soft delete).
 *
 * <p><b>이 엔티티는 자기 자신이 애그리거트 루트다</b>(ADR-0007) — {@code placement}·{@code user}는
 * 전부 다른 루트라 어느 쪽에도 {@code cascade}를 걸지 않는다. 걸면 댓글 하나를 저장할 때 배치와
 * 사용자까지 저장이 번진다.
 *
 * <p><b>DDL 쪽 {@code ON DELETE} 정책이 FK마다 다르다</b> — {@code placement_id}는
 * {@code CASCADE}(배치가 물리 삭제되면 댓글도 사라진다), {@code user_id}는 {@code SET NULL}이다.
 * 이건 DB 제약이므로 {@code cascade = CascadeType.REMOVE}로 옮겨 적지 않는다 — 그건 JPA가 자식을
 * 먼저 지우는 전혀 다른 동작이고 애그리거트 경계를 넘어 저장이 번진다.
 */
@Entity
@Table(name = "comment")
@SequenceGenerator(name = "comment_seq", sequenceName = "comment_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class Comment extends BaseSoftDeleteEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "comment_seq")
  private Long id;

  /** 댓글이 달린 배치. 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다. */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "placement_id", nullable = false)
  private Placement placement;

  /**
   * 작성자. <b>DDL이 {@code ON DELETE SET NULL}이라 nullable이다</b> — 작성자가 탈퇴해도 댓글은
   * 남고 작성자만 비워진다(대화 맥락이 통째로 사라지지 않게).
   */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id")
  private User user;

  /**
   * 본문. <b>{@code TEXT}라 {@code length}를 주지 않는다</b> — 길이를 주면 {@code VARCHAR(255)}로
   * 매핑돼 {@code ddl-auto: validate}가 타입 불일치로 부팅을 죽인다.
   */
  @Column(name = "content", nullable = false, columnDefinition = "TEXT")
  private String content;

  public static Comment create(Placement placement, User user, String content) {
    return Comment.builder()
        .placement(placement)
        .user(user)
        .content(content)
        .build();
  }

  /** 본문 수정. 감사 3종이라 {@code updated_at}이 있고 이 경로로 갱신된다. */
  public void updateContent(String content) {
    this.content = content;
  }
}
