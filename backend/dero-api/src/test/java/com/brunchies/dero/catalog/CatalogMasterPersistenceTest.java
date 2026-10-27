package com.brunchies.dero.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.brunchies.dero.AbstractPostgresIntegrationTest;
import com.brunchies.dero.catalog.repository.BrandRepository;
import com.brunchies.dero.catalog.repository.CategoryRepository;
import com.brunchies.dero.catalog.repository.DeskTextureRepository;
import com.brunchies.dero.catalog.repository.HashtagRepository;
import com.brunchies.dero.catalog.repository.VesaSpecRepository;
import com.brunchies.dero.catalog.repository.VibeRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class CatalogMasterPersistenceTest extends AbstractPostgresIntegrationTest {

	@Autowired
	private BrandRepository brandRepository;

	@Autowired
	private CategoryRepository categoryRepository;

	@Autowired
	private DeskTextureRepository deskTextureRepository;

	@Autowired
	private VibeRepository vibeRepository;

	@Autowired
	private HashtagRepository hashtagRepository;

	@Autowired
	private VesaSpecRepository vesaSpecRepository;

	@Autowired
	private EntityManager entityManager;

	@Test
	@DisplayName("brand 저장·조회 — description은 TEXT라 길이 제한이 없다")
	void 브랜드_왕복() {
		Long id = brandRepository.save(
				Brand.create("데스커", "긴 소개글".repeat(200), "https://desker.co.kr",
						"brand/logo/desker.png")).getId();
		entityManager.flush();
		entityManager.clear();

		Brand found = brandRepository.findById(id).orElseThrow();
		assertThat(found.getName()).isEqualTo("데스커");
		assertThat(found.getDescription()).hasSize("긴 소개글".length() * 200);
		assertThat(found.getBrandUrl()).isEqualTo("https://desker.co.kr");
		assertThat(found.getLogoImageKey()).isEqualTo("brand/logo/desker.png");
		assertThat(found.getCreatedAt()).isNotNull();
		assertThat(found.isDeleted()).isFalse();
	}

	@Test
	@DisplayName("category 자기참조 — 루트는 parent가 NULL이고 자식은 루트를 가리킨다")
	void 카테고리_부모_자식() {
		Category root = categoryRepository.save(Category.createRoot("모니터", "화면 장치", 1));
		Category child = categoryRepository.save(Category.createChild(root, "27인치", null, 2));
		entityManager.flush();
		entityManager.clear();

		Category foundRoot = categoryRepository.findById(root.getId()).orElseThrow();
		assertThat(foundRoot.getParent()).isNull();
		assertThat(foundRoot.getDisplayOrder()).isEqualTo(1);

		Category foundChild = categoryRepository.findById(child.getId()).orElseThrow();
		assertThat(foundChild.getParent().getId()).isEqualTo(root.getId());
		assertThat(foundChild.getParent().getName()).isEqualTo("모니터");
		assertThat(foundChild.getDescription()).isNull();
	}

	@Test
	@DisplayName("desk_texture 저장·조회 — NUMERIC(3,2)는 BigDecimal, 단색 재질은 맵 file key가 NULL")
	void 상판_재질_왕복() {
		Long walnutId = deskTextureRepository.save(
				DeskTexture.create("월넛", "#6B4A2F", "desk-texture/walnut_albedo.ktx2",
						"desk-texture/walnut_rough.ktx2",
						"desk-texture/walnut_normal.ktx2", new BigDecimal("0.65"),
						new BigDecimal("0.00"), 551, 1)).getId();
		Long blackId = deskTextureRepository.save(
				DeskTexture.create("블랙", "#1A1A1A", null, null, null, new BigDecimal("0.40"),
						new BigDecimal("0.05"), null, 3)).getId();
		entityManager.flush();
		entityManager.clear();

		DeskTexture walnut = deskTextureRepository.findById(walnutId).orElseThrow();
		assertThat(walnut.getBaseColor()).isEqualTo("#6B4A2F");
		assertThat(walnut.getRoughness()).isEqualByComparingTo("0.65");
		assertThat(walnut.getMetalness()).isEqualByComparingTo("0.00");
		assertThat(walnut.getTileSizeMm()).isEqualTo(551);
		assertThat(walnut.getAlbedoKey()).isEqualTo("desk-texture/walnut_albedo.ktx2");

		DeskTexture black = deskTextureRepository.findById(blackId).orElseThrow();
		assertThat(black.getAlbedoKey()).isNull();
		assertThat(black.getRoughnessKey()).isNull();
		assertThat(black.getNormalKey()).isNull();
		assertThat(black.getTileSizeMm()).isNull();
		assertThat(black.getDisplayOrder()).isEqualTo(3);
	}

	@Test
	@DisplayName("vibe·hashtag·vesa_spec 저장·조회")
	void 태그_마스터_왕복() {
		Long vibeId = vibeRepository.save(Vibe.create("미니멀")).getId();
		Long hashtagId = hashtagRepository.save(Hashtag.create("화이트톤", "밝은 색 위주 세팅")).getId();
		Long vesaId = vesaSpecRepository.save(VesaSpec.create(100, 100)).getId();
		entityManager.flush();
		entityManager.clear();

		assertThat(vibeRepository.findById(vibeId).orElseThrow().getName()).isEqualTo("미니멀");

		Hashtag hashtag = hashtagRepository.findById(hashtagId).orElseThrow();
		assertThat(hashtag.getName()).isEqualTo("화이트톤");
		assertThat(hashtag.getDescription()).isEqualTo("밝은 색 위주 세팅");

		VesaSpec vesa = vesaSpecRepository.findById(vesaId).orElseThrow();
		assertThat(vesa.getWidthMm()).isEqualTo(100);
		assertThat(vesa.getHeightMm()).isEqualTo(100);
		assertThat(vesa.getCreatedAt()).isNotNull();
	}
}
