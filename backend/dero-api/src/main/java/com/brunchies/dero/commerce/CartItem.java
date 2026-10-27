package com.brunchies.dero.commerce;

import com.brunchies.dero.global.entity.BaseEntity;
import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.global.exception.CommonErrorCode;
import com.brunchies.dero.product.Product;
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
 * 장바구니에 담긴 제품 한 줄.
 *
 * <p><b>{@code cart} 테이블은 두지 않는다</b> — 사용자당 장바구니가 하나뿐이라 {@code cart} 행은
 * {@code user_id}만 든 껍데기가 된다. 장바구니는 "이 사용자의 {@code cart_item} 집합"이고,
 * {@code CartItem} 자신이 애그리거트 루트다(ADR-0007).
 *
 * <p><b>정션·토글과 달리 {@code updated_at}이 실제로 채워진다</b> — 수량이 바뀌어 생성 후에도 행이
 * 수정되기 때문이다.
 *
 * <p><b>hard delete 테이블이라 {@code deleted_at}이 없다.</b> soft delete와
 * {@code uq_cart_item_user_id_product_id}는 충돌한다 — 뺀 행을 남겨두면 같은 제품을 다시 담는 순간
 * 유니크 제약에 막힌다. 같은 제품을 두 번 담으면 행이 아니라 수량이 늘고
 * ({@link #increaseQuantity(int)}), 빼면 행을 지운다.
 *
 * <p><b>FK 2개가 전부 DDL 쪽 {@code ON DELETE CASCADE}다</b> — 참조 컬럼이 둘 다 {@code NOT NULL}이라
 * {@code SET NULL}을 쓸 수 없고, {@code NO ACTION}이면 부모의 물리 삭제 자체가 거부되어 hard delete
 * 정의와 어긋난다. 이건 DB 제약이므로 {@code cascade = CascadeType.REMOVE}로 옮겨 적지 않는다 —
 * 그건 JPA가 자식을 먼저 지우는 전혀 다른 동작이고 애그리거트 경계를 넘어 저장이 번진다.
 */
@Entity
@Table(name = "cart_item")
@SequenceGenerator(name = "cart_item_seq", sequenceName = "cart_item_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class CartItem extends BaseEntity {

  /** 담을 수 있는 최소 수량. 0이 되면 행 자체를 지우는 게 맞다(hard delete). */
  private static final int MIN_QUANTITY = 1;

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "cart_item_seq")
  private Long id;

  /** 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다 — 걸면 저장이 경계를 넘어 번진다. */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private User user;

  /** 다른 애그리거트 루트라 {@code cascade}를 걸지 않는다. */
  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "product_id", nullable = false)
  private Product product;

  /**
   * 담은 개수. DDL 기본값이 {@code 1}이고 {@code NOT NULL}이라 {@code Integer}가 아닌 {@code int}다 —
   * "수량 미지정"이라는 상태가 없다.
   */
  @Column(name = "quantity", nullable = false)
  private int quantity;

  /**
   * 새로 담는다. 수량은 DDL 기본값과 같은 {@code 1}에서 시작한다 — 담는 행위 자체가 "한 개"를
   * 뜻하므로 호출자가 수량을 정하지 않아도 성립한다.
   */
  public static CartItem create(User user, Product product) {
    return CartItem.builder()
        .user(user)
        .product(product)
        .quantity(MIN_QUANTITY)
        .build();
  }

  /**
   * 이미 담긴 제품을 다시 담았을 때 수량을 더한다. 새 행을 만들면
   * {@code uq_cart_item_user_id_product_id}에 막히므로 담기 경로는 항상 이쪽으로 온다.
   */
  public void increaseQuantity(int amount) {
    if (amount < 1) {
      throw new BusinessException(CommonErrorCode.INVALID_INPUT);
    }
    this.quantity += amount;
  }

  /**
   * 사용자가 수량을 직접 고쳤을 때. {@code 0} 이하는 삭제를 뜻하므로 여기서 받지 않는다 — 수량 0인
   * 행을 남기면 장바구니 화면과 DB가 서로 다른 말을 한다.
   */
  public void changeQuantity(int quantity) {
    if (quantity < MIN_QUANTITY) {
      throw new BusinessException(CommonErrorCode.INVALID_INPUT);
    }
    this.quantity = quantity;
  }
}
