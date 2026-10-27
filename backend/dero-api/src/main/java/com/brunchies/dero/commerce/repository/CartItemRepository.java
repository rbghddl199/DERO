package com.brunchies.dero.commerce.repository;

import com.brunchies.dero.commerce.CartItem;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 장바구니 애그리거트 루트 리포지토리(ADR-0007).
 *
 * <p>{@code cart} 테이블이 없으므로 장바구니 조회는 {@code user_id}로 이 테이블을 긁는 것이다 —
 * 루트가 {@link CartItem} 자신이라 별도 {@code CartRepository}는 만들지 않는다.
 *
 * <p><b>소유자 조건은 조회 쿼리 안에 있다</b> — 서비스에서 꺼낸 뒤 비교하면 한 자리만 빠뜨려도
 * 남의 항목이 그 경로로 열린다. 남의 행은 빈 결과가 되고 서비스가 404로 바꾼다(403이 아니다).
 */
public interface CartItemRepository extends JpaRepository<CartItem, Long> {

	/**
	 * 내 장바구니 전체. <b>커서 페이지가 아니다</b> — 사용자가 손으로 담는 목록이라 화면에 다 들어온다
	 * (북마크 그룹과 같은 판단).
	 *
	 * <p>{@code join fetch}가 필수다 — {@code product}가 LAZY라 응답을 조립하며 이름·가격을 읽는
	 * 순간 항목마다 select가 나간다. {@code brand}는 nullable ToOne이라 {@code left join fetch}다.
	 *
	 * <p><b>소프트 삭제된 제품은 목록에서 뺀다</b> — 카탈로그에서 내려간 제품을 계속 보여주면
	 * 상세로 못 넘어가는 카드가 장바구니에 남는다. 행 자체는 지우지 않는다({@code cart_item}은
	 * hard delete지만 {@code product.deleted_at}은 물리 삭제가 아니라 FK CASCADE가 안 돈다).
	 *
	 * <p>최근에 담은 것이 위다.
	 */
	@Query("""
			select c from CartItem c
				join fetch c.product p
				left join fetch p.brand
			where c.user.id = :userId
				and p.deletedAt is null
			order by c.id desc
			""")
	List<CartItem> findMine(@Param("userId") Long userId);

	/** 담기 경로 — 이미 담긴 제품이면 새 행이 아니라 이 행의 수량이 오른다. */
	Optional<CartItem> findByUser_IdAndProduct_Id(Long userId, Long productId);

	/** 수량 변경·빼기 경로. 남의 항목은 빈 결과다. */
	Optional<CartItem> findByIdAndUser_Id(Long id, Long userId);
}
