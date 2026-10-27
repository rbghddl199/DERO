package com.brunchies.dero.image;

import com.brunchies.dero.global.entity.BaseEntity;
import com.brunchies.dero.placement.Placement;
import com.brunchies.dero.placement.TimeOfDay;
import com.brunchies.dero.user.User;
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
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * AI 상상도 생성 이력.
 *
 * <p><b>삭제 개념 자체가 없다</b> — soft delete도 hard delete도 하지 않는다. 이 테이블의 행 수가
 * 일일 생성 한도(REQ-IMG-03) 카운트의 근거라, 지우는 순간 한도가 무너져 사용자가 하루에 몇 번이든
 * 뽑을 수 있게 된다. 그래서 {@code deleted_at}이 없고 삭제 메서드도 두지 않는다.
 *
 * <p>생성 후 행이 변하지 않으므로 {@code updated_at}은 영원히 NULL이다 — 컬럼은 {@link BaseEntity}가
 * 전 테이블에 통일해서 실재하지만 이 표에서는 채워지지 않는다.
 *
 * <p>애그리거트 루트다(ADR-0007) — {@code user}·{@code placement}와 생명주기가 다르다.
 *
 * <p><b>{@code idx_generated_image_user_id_created_at}(user_id, created_at) 복합 인덱스가 있다</b> —
 * "이 사용자가 오늘 몇 장 뽑았나"를 세는 한도 쿼리 전용이다. 조회 메서드를 짤 때 이 축을 벗어나면
 * 풀스캔이 된다. 인덱스 자체는 DDL 정본({@code docs/context/erd.md})이 갖는다 —
 * {@code ddl-auto: validate}라 Hibernate가 스키마를 만들지 않으므로 엔티티에 선언하지 않는다.
 */
@Entity
@Table(name = "generated_image")
@SequenceGenerator(name = "generated_image_seq", sequenceName = "generated_image_id_seq",
    allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class GeneratedImage extends BaseEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "generated_image_seq")
  private Long id;

  /**
   * 뽑은 사람. <b>{@code NOT NULL}이다</b> — 한도가 사용자당이라 주체 없는 이력은 셀 수가 없어
   * 뜻이 없다. 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다.
   */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private User user;

  /**
   * 어느 배치로 뽑았는지. <b>nullable이고 DDL 쪽 FK가 {@code ON DELETE SET NULL}이다</b> — 출처
   * 배치가 지워져도 생성 이력은 남아야 한도 카운트가 유지된다. 그래서 여기 NULL은 "배치 없이
   * 뽑았다"가 아니라 "출처 배치가 사라졌다"까지 포함한다.
   *
   * <p>{@code ON DELETE}는 DB 제약이므로 {@code cascade}로 옮겨 적지 않는다 — 전혀 다른 동작이고
   * 애그리거트 경계를 넘어 저장이 번진다.
   */
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "placement_id")
  private Placement placement;

  /** 스토리지에 올린 결과 이미지의 object key. 길이 1024는 S3 object key 최대 길이다. */
  @Column(name = "image_key", nullable = false, length = 1024)
  private String imageKey;

  @Enumerated(EnumType.STRING)
  @Column(name = "time_of_day", nullable = false, length = 10)
  private TimeOfDay timeOfDay;

  /**
   * 데스크 피드 카드에 쓰이는 대표 1장인지(ADR-0015 결정 6). 한 업로드가 만드는 상상도 행 중
   * 정확히 하나만 {@code true}다 — <b>"배치당 대표 1장"은 부분 유니크 인덱스
   * {@code uq_generated_image_placement_id ... WHERE is_primary}가 DB에서 강제한다</b>
   * ({@code product_image}·{@code post_image}와 같은 형태).
   *
   * <p>대표를 바꾸는 메서드는 아직 없다 — 상상도를 만드는 업로드 파이프라인이 구현 전이라 지금은
   * 이 값을 {@code false} 말고 다른 값으로 쓰는 경로가 없다. 대표 지정·변경은 그 파이프라인이
   * 붙을 때 함께 온다(변경은 기존 대표를 내리고 새 대표를 올리는 한 트랜잭션이어야 한다 — 아니면
   * 위 유니크 인덱스가 막는다).
   */
  @Column(name = "is_primary", nullable = false)
  private boolean isPrimary;

  /**
   * 생성 결과를 이력으로 남긴다. <b>대응하는 삭제 메서드는 없다</b> — 지우면 일일 한도 카운트가
   * 무너진다.
   */
  public static GeneratedImage create(User user, Placement placement, String imageKey,
      TimeOfDay timeOfDay) {
    return GeneratedImage.builder()
        .user(user)
        .placement(placement)
        .imageKey(imageKey)
        .timeOfDay(timeOfDay)
        .isPrimary(false)
        .build();
  }

  /**
   * 데스크 피드 카드에 쓰일 <b>대표 1장</b>으로 남긴다(ADR-0015 결정 6). 한 업로드가 만드는 행 중
   * 정확히 하나만 이 팩터리를 탄다.
   *
   * <p><b>같은 배치에 대표가 이미 있으면 부분 유니크 인덱스가 INSERT를 거부한다</b> —
   * 재업로드는 옛 대표를 먼저 내리고({@code GeneratedImageRepository.demotePrimaries}) 새 대표를
   * 올리는 한 트랜잭션이어야 한다. 순서를 바꾸면 재업로드가 통째로 실패한다.
   */
  public static GeneratedImage createPrimary(User user, Placement placement, String imageKey,
      TimeOfDay timeOfDay) {
    return GeneratedImage.builder()
        .user(user)
        .placement(placement)
        .imageKey(imageKey)
        .timeOfDay(timeOfDay)
        .isPrimary(true)
        .build();
  }
}
