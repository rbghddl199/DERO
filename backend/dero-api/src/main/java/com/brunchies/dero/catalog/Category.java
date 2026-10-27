package com.brunchies.dero.catalog;

import com.brunchies.dero.global.entity.BaseSoftDeleteEntity;
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
 * 탐색·분류 트리. 감사 3종.
 *
 * <p>{@code parent_id}는 자기참조 FK이고 <b>루트는 NULL</b>이다. {@code name}에 유니크를 걸지 않는다 —
 * 부모가 다르면 같은 이름이 정당하다("모니터 &gt; 27인치", "책상 &gt; 1200mm").
 */
@Entity
@Table(name = "category")
@SequenceGenerator(name = "category_seq", sequenceName = "category_id_seq", allocationSize = 50)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class Category extends BaseSoftDeleteEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "category_seq")
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "parent_id")
	private Category parent;

	@Column(name = "name", nullable = false, length = 50)
	private String name;

	@Column(name = "description", length = 255)
	private String description;

	@Column(name = "display_order", nullable = false)
	private int displayOrder;

	/** 최상위 갈래. 상위가 없으므로 {@code parent_id}는 NULL이다. */
	public static Category createRoot(String name, String description, int displayOrder) {
		return Category.builder()
				.parent(null)
				.name(name)
				.description(description)
				.displayOrder(displayOrder)
				.build();
	}

	public static Category createChild(Category parent, String name, String description,
			int displayOrder) {
		return Category.builder()
				.parent(parent)
				.name(name)
				.description(description)
				.displayOrder(displayOrder)
				.build();
	}

	/**
	 * 관리자 수정. 전 필드를 받는다 — 병합과 <b>부모 순환 검사</b>는 서비스가 끝내고 온다. 순환 검사가
	 * 여기 없는 이유는 조상 사슬을 거슬러 오르려면 부모를 계속 로드해야 하는데, 엔티티는 리포지토리를
	 * 모른다는 규칙(ADR-0001)이 그 탐색을 엔티티 밖으로 밀어내기 때문이다.
	 */
	public void update(Category parent, String name, String description, int displayOrder) {
		this.parent = parent;
		this.name = name;
		this.description = description;
		this.displayOrder = displayOrder;
	}
}
