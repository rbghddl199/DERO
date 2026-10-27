package com.brunchies.dero.product;

import com.brunchies.dero.global.entity.BaseEntity;
import com.brunchies.dero.global.exception.BusinessException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 제품의 glTF/GLB 에셋. {@link Product} 1:1이되 <b>관계가 nullable</b>이다 — 책상은 규격값으로 절차
 * 생성하므로(D18) 행이 아예 없다.
 *
 * <p><b>{@code product}와 식별관계다</b> — {@code product_id}가 PK이자 FK({@link MapsId})라 부모
 * 없는 에셋은 존재할 수 없다. "규격 없는 떠 있는 에셋"은 이 스키마에 없다. 애그리거트 안이라
 * {@code AssetRepository}를 만들지 않는다(ADR-0007) — 저장·삭제는 {@link Product}를 통과한다.
 *
 * <p><b>{@link ReviewStatus}와 {@code product.status}는 다른 축이다</b> — 전자는 GLB·규격 검수 단계,
 * 후자는 카탈로그 노출 여부다. 자작 제품이 남에게 보이려면 둘 다 통과해야 한다.
 *
 * <p><b>발광 저작값은 여기 없다</b>(2026-07-29, DERO-222) — 옛 발광 매니페스트 JSONB 컬럼은
 * {@link ProductEmitter} 테이블로 대체됐다. 부모가 {@link Product}인 이유는 절차 생성 발광 제품이
 * GLB가 없어 이 행 자체를 만들 수 없기 때문이다({@code asset_key}가 {@code NOT NULL}이다).
 */
@Entity
@Table(name = "asset")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder(access = AccessLevel.PRIVATE)
public class Asset extends BaseEntity {

  /** {@link MapsId}가 {@code product}의 id를 그대로 가져오므로 직접 채우지 않는다. */
  @Id
  private Long productId;

  @MapsId
  @OneToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "product_id")
  private Product product;

  @Column(name = "asset_key", nullable = false, length = 1024)
  private String assetKey;

  /** 경량화 검수용. */
  @Column(name = "polygon_count")
  private Integer polygonCount;

  @Enumerated(EnumType.STRING)
  @Column(name = "review_status", nullable = false, length = 20)
  private ReviewStatus reviewStatus;

  /** 반려 사유 — {@code REJECTED}일 때만 채운다(REQ-ADM-04). */
  @Column(name = "review_note", length = 500)
  private String reviewNote;

  @Column(name = "verified_at")
  private OffsetDateTime verifiedAt;

  @Enumerated(EnumType.STRING)
  @Column(name = "glb_export_mode", nullable = false, length = 20)
  private GlbExportMode glbExportMode;

  /**
   * 코드 재질 프리셋 이름 — {@code CLEAR_ACRYLIC} · {@code METALLIC} · {@code WHITE} ·
   * {@code BLACK} 4종.
   *
   * <p><b>필수 여부를 {@link #glbExportMode}가 가른다</b>(WAS 강제 — 이 스키마는 {@code CHECK}를
   * 쓰지 않는다): {@code PART_SEGMENTATION}이면 <b>필수</b>다(part-seg export는 텍스처를 아예 주지
   * 않아 재질을 고를 곳이 여기밖에 없다), {@code TEXTURE}면 <b>NULL</b>이어야 한다(재질 정본이 GLB
   * 안의 PBR 텍스처라 값을 넣으면 어느 쪽이 정본인지 갈린다).
   *
   * <p><b>색·거칠기·금속성의 정본은 코드다</b>({@code frontend/src/three/render/materials.ts}의
   * {@code materialForSkin()}). DB에 같은 수치를 또 받으면 정본이 둘이 되고, 어긋난 쪽이 렌더를
   * 지배한다. 그래서 PBR 수치가 아니라 프리셋 이름 하나만 받는다(2026-07-23 확정).
   *
   * <p>에셋 하나에 {@code finish} 하나다 — 로더가 전 메쉬에 같은 재질을 입힌다. 투톤이 필요해지면
   * 그건 {@code asset_part_material}(1:N) 신규 테이블이지 여기 컬럼을 늘리는 게 아니다.
   */
  @Enumerated(EnumType.STRING)
  @Column(name = "finish", length = 20)
  private Finish finish;

  /** 관절 없는 에셋은 NULL. 상세는 {@link RigManifest}. */
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "rig_manifest", columnDefinition = "jsonb")
  private RigManifest rigManifest;

  /**
   * 업로드 직후 상태. {@code review_status}는 DDL 기본값과 같은 {@code PENDING}으로 시작한다 —
   * 업로더 본인만 보고 자기 배치에는 바로 쓸 수 있다(D20).
   */
  public static Asset create(Product product, String assetKey, GlbExportMode glbExportMode,
      Finish finish, Integer polygonCount, RigManifest rigManifest) {
    requireFinishMatchingExportMode(glbExportMode, finish);
    return Asset.builder()
        .product(product)
        .assetKey(assetKey)
        .glbExportMode(glbExportMode)
        .finish(finish)
        .polygonCount(polygonCount)
        .rigManifest(rigManifest)
        .reviewStatus(ReviewStatus.PENDING)
        .build();
  }

  /** 검수 통과. 반려 사유는 지운다 — {@code review_note}는 {@code REJECTED}일 때만 유효하다. */
  public void approve() {
    this.reviewStatus = ReviewStatus.APPROVED;
    this.reviewNote = null;
    this.verifiedAt = OffsetDateTime.now();
  }

  /** 반려. {@code verified_at}은 검수 <b>통과</b> 시각이라 건드리지 않는다. */
  public void reject(String reviewNote) {
    this.reviewStatus = ReviewStatus.REJECTED;
    this.reviewNote = reviewNote;
  }

	/**
	 * 재업로드 — 같은 행의 내용을 갈아끼운다({@code PUT /admin/products/{id}/asset}이 upsert라 에셋
	 * DELETE가 없다: 에셋 없는 제품이 유효한 건 {@code DESK}뿐이라 "제거"가 유효 상태가 아니다).
	 *
	 * <p>영속 엔티티라 빌더로 재조립하지 않는다 — dirty checking이 UPDATE를 낸다(규칙 13). 새 행을
	 * 만들면 {@code product_id}가 PK라 어차피 같은 자리인데 검수 이력만 잃는다.
	 *
	 * <p><b>{@code review_status}는 건드리지 않는다</b> — 등록 흐름의 즉시 승인은 루트
	 * {@link Product#registerAsset}이 {@link #approve()}로 표현한다. 여기서 같이 하면 자작 업로드
	 * (D20)가 재업로드만으로 검수를 통과하는 길이 열린다.
	 */
	public void replace(String assetKey, GlbExportMode glbExportMode, Finish finish,
			Integer polygonCount, RigManifest rigManifest) {
		requireFinishMatchingExportMode(glbExportMode, finish);
		this.assetKey = assetKey;
		this.glbExportMode = glbExportMode;
		this.finish = finish;
		this.polygonCount = polygonCount;
		this.rigManifest = rigManifest;
	}

	/**
	 * {@code finish}의 필수 여부는 {@code glb_export_mode}가 결정한다(erd.md {@code asset} 절 —
	 * 이 스키마는 {@code CHECK}를 쓰지 않으므로 WAS가 강제한다).
	 *
	 * <p><b>두 필드가 서로를 보는 조건부 규칙이라 Bean Validation으로 표현되지 않아 여기 있다</b>
	 * (규칙 15가 사유를 남기라고 한 예외). 단일 필드 제약({@code assetKey} 필수 등)은 요청 DTO의
	 * 애노테이션이 맡는다 — 검증을 두 곳에 복사하지 않는다.
	 */
	private static void requireFinishMatchingExportMode(GlbExportMode glbExportMode, Finish finish) {
		if (glbExportMode == GlbExportMode.PART_SEGMENTATION && finish == null) {
			throw new BusinessException(ProductErrorCode.PRODUCT_ASSET_FINISH_REQUIRED);
		}
		if (glbExportMode == GlbExportMode.TEXTURE && finish != null) {
			throw new BusinessException(ProductErrorCode.PRODUCT_ASSET_FINISH_NOT_ALLOWED);
		}
	}
}
