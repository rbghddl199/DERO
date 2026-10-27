package com.brunchies.dero.catalog.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.DeskTexture;
import com.brunchies.dero.catalog.dto.DeskTexturePublicResponse;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 공개 상판 재질 목록(`GET /api/v1/desk-textures`)의 실제 정렬·소프트 삭제 필터·presign 분기를
 * 검증한다 — 리뷰가 지목한 테스트 공백(DERO-319).
 */
class DeskTextureServicePersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private DeskTextureService deskTextureService;

	@Autowired
	private DeskTextureRepository deskTextures;

	@Autowired
	private EntityManager entityManager;

	@Test
	@DisplayName("displayOrder 오름차순으로 정렬하고, 같은 순서값이면 id로 결정적으로 가른다")
	void 목록_정렬() {
		DeskTexture b = deskTextures.save(DeskTexture.create("오크", "#C9A876", null, null, null,
				BigDecimal.ONE, BigDecimal.ZERO, null, 2));
		DeskTexture a1 = deskTextures.save(DeskTexture.create("블랙", "#1A1A1A", null, null, null,
				BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		DeskTexture a2 = deskTextures.save(DeskTexture.create("화이트", "#F5F5F5", null, null, null,
				BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		entityManager.flush();

		assertThat(deskTextureService.list())
				.extracting(DeskTexturePublicResponse::id)
				.containsSubsequence(a1.getId(), a2.getId(), b.getId());
	}

	@Test
	@DisplayName("소프트 삭제한 재질은 목록에서 빠진다")
	void 목록_소프트삭제_제외() {
		DeskTexture alive = deskTextures.save(DeskTexture.create("월넛", "#6B4A2F", null, null, null,
				BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		DeskTexture deleted = deskTextures.save(DeskTexture.create("옛 재질", "#000000", null, null,
				null, BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		deleted.softDelete();
		entityManager.flush();

		assertThat(deskTextureService.list())
				.extracting(DeskTexturePublicResponse::id)
				.contains(alive.getId())
				.doesNotContain(deleted.getId());
	}

	@Test
	@DisplayName("맵 key가 있으면 presigned GET URL로 바뀐다")
	void 목록_맵_presign() {
		DeskTexture texture = deskTextures.save(DeskTexture.create("오크", "#C9A876",
				"desk-textures/1/albedo.ktx2", null, null,
				BigDecimal.ONE, BigDecimal.ZERO, 300, 1));
		entityManager.flush();

		DeskTexturePublicResponse response = deskTextureService.list().stream()
				.filter(r -> r.id().equals(texture.getId()))
				.findFirst()
				.orElseThrow();
		assertThat(response.albedoUrl()).isNotBlank();
		assertThat(response.roughnessUrl()).isNull();
		assertThat(response.normalUrl()).isNull();
	}

	@Test
	@DisplayName("단색(도장) 재질은 맵 key가 없어 presign을 호출하지 않고 URL도 null이다")
	void 목록_단색_재질_presign_스킵() {
		DeskTexture texture = deskTextures.save(DeskTexture.create("블랙", "#1A1A1A", null, null, null,
				BigDecimal.ONE, BigDecimal.ZERO, null, 1));
		entityManager.flush();

		DeskTexturePublicResponse response = deskTextureService.list().stream()
				.filter(r -> r.id().equals(texture.getId()))
				.findFirst()
				.orElseThrow();
		assertThat(response.albedoUrl()).isNull();
		assertThat(response.roughnessUrl()).isNull();
		assertThat(response.normalUrl()).isNull();
	}
}
