package com.brunchies.dero.community;

import com.brunchies.dero.global.entity.BaseEntity;
import com.brunchies.dero.product.Product;
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
 * 제품 찜.
 *
 * <p><b>hard delete 테이블이라 {@code deleted_at}이 없다.</b> soft delete와 {@code UNIQUE}는
 * 충돌한다 — 찜을 푼 행을 남겨두면 재찜이 {@code uq_product_like_user_id_product_id}에 막히고,
 * 피하려면 유니크 키에 {@code deleted_at}을 섞는 편법이 필요해진다. 껐다 켰다 하는 관계는 행을
 * 지운다.
 *
 * <p><b>FK 2개가 전부 DDL 쪽 {@code ON DELETE CASCADE}다</b> — 참조 컬럼이 {@code NOT NULL}이라
 * {@code SET NULL}을 쓸 수 없고, {@code NO ACTION}이면 부모의 물리 삭제 자체가 거부되어 hard
 * delete 정의와 어긋난다. 이건 DB 제약이므로 {@code cascade = CascadeType.REMOVE}로 옮겨 적지
 * 않는다.
 *
 * <p>PK는 대리키 {@code id}다. 두 FK 조합은 복합 PK가 아니라 별도 {@code UNIQUE} 제약이다.
 */
@Entity
@Table(name = "product_like")
@SequenceGenerator(name = "product_like_seq", sequenceName = "product_like_id_seq",
    allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class ProductLike extends BaseEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "product_like_seq")
  private Long id;

  /** 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다 — 걸면 저장이 경계를 넘어 번진다. */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private User user;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "product_id", nullable = false)
  private Product product;

  public static ProductLike create(User user, Product product) {
    return ProductLike.builder()
        .user(user)
        .product(product)
        .build();
  }
}
