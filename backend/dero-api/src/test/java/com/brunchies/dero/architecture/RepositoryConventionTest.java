package com.brunchies.dero.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaParameterizedType;
import com.tngtech.archunit.core.domain.JavaType;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.springframework.data.repository.Repository;

/**
 * ADR-0007 결정 1~6(애그리거트 경계)의 기계 강제.
 *
 * <p>리포지토리는 <b>애그리거트 루트에만</b> 둔다. {@code PlacedItemRepository}·{@code AssetRepository}
 * 같은 것을 만들면 루트를 우회해 자식을 직접 저장·삭제할 수 있게 되고, 루트가 지키던 불변식이
 * 서비스로 새어나간다.
 *
 * <p>판정 방법: {@code JpaRepository<T, ID>}의 제네릭 인자 {@code T}를 클래스 파일의 시그니처
 * 속성에서 읽어 허용 목록과 대조한다. 이름 규칙({@code XxxRepository}의 Xxx)이 아니라
 * <b>실제 타입 인자</b>를 보므로 파일명을 바꿔 우회할 수 없다.
 */
@AnalyzeClasses(packages = "com.brunchies.dero", importOptions = ImportOption.DoNotIncludeTests.class)
class RepositoryConventionTest {

	/**
	 * 애그리거트 루트 24종. 실제 {@code *Repository.java}의 타입 인자를 세어 확인한 목록이다.
	 *
	 * <p>ADR-0007이 정한 루트 5종(Placement·Product·User·CartItem·GeneratedImage)에
	 * 마스터 6종(Brand·Category·Vibe·Hashtag·DeskTexture·VesaSpec)과
	 * 커뮤니티 8종(Comment·PlacementLike·ProductLike·PlacementBookmark·PlacementBookmarkGroup·
	 * Post·PostLike·PostComment)이 더해진다.
	 * 마스터·커뮤니티는 부모에 묶인 자식이 아니라 각자 독립 수명을 갖는 루트다.
	 *
	 * <p>게시글 3종은 ADR-0011 결정 8이 더한 것이다. 같은 결정이 {@code PostImage}·
	 * {@code ProductImage}는 각각 {@code Post}·{@code Product} <b>안</b>으로 못 박았으므로
	 * 여기 넣지 않는다 — 넣는 순간 루트를 우회한 저장이 열린다.
	 *
	 * <p>동의 2종({@code Terms}·{@code UserConsent})은 ADR-0007 결정 1의 2026-08-01 추가분이다
	 * (DERO-337). 원안이 둘을 어느 쪽으로도 분류하지 않아 조회 경로 자체가 없었다 —
	 * {@code Terms}는 마스터 6종과 같은 성격이고, {@code UserConsent}는 커뮤니티 토글 4종과 같은
	 * 자리다({@code User}로 걸어가면 동의 이력 전체를 컬렉션으로 물고 와야 한다).
	 *
	 * <p><b>{@code Follow}는 ADR-0007 결정 1의 2026-08-02 추가분이다</b>(DERO-344). 원안이
	 * {@code follow}를 {@code User} 애그리거트 <b>안</b>에 넣었는데, 그러면 팔로워 목록(커서
	 * 페이지네이션)과 팔로워 수(집계)가 둘 다 컬렉션 통째 로드가 된다 — ADR-0006 결정 11이 금지한
	 * 조합이다. 모양·수명이 {@code placement_like}와 같고 그쪽은 이미 루트다.
	 *
	 * <p><b>데스크피드 3종({@code DeskFeed}·{@code DeskFeedLike}·{@code DeskFeedComment})은
	 * ADR-0033의 2026-08-10 추가분이다</b>(DERO-561). 결정 1이 게시글 3종의 근거(ADR-0011
	 * 결정 8 — 대상별 좋아요·댓글은 각자 루트)를 세 번째로 재적용했다. 같은 결정이
	 * {@code DeskFeedImage}·{@code DeskFeedHashtag}는 {@code DeskFeed} <b>안</b>으로 못 박았으므로
	 * 여기 넣지 않는다.
	 *
	 * <p>여기 없는 엔티티에 리포지토리를 만들려면 <b>ADR-0007을 먼저 고쳐야 한다</b> —
	 * 이 목록에 한 줄 더하는 것은 애그리거트 경계를 바꾸는 설계 결정이다.
	 */
	private static final Set<String> 애그리거트_루트 = Set.of(
			"com.brunchies.dero.placement.Placement",
			"com.brunchies.dero.product.Product",
			"com.brunchies.dero.user.User",
			"com.brunchies.dero.commerce.CartItem",
			"com.brunchies.dero.image.GeneratedImage",
			"com.brunchies.dero.catalog.Brand",
			"com.brunchies.dero.catalog.Category",
			"com.brunchies.dero.catalog.Vibe",
			"com.brunchies.dero.catalog.Hashtag",
			"com.brunchies.dero.catalog.DeskTexture",
			"com.brunchies.dero.catalog.VesaSpec",
			"com.brunchies.dero.community.Comment",
			"com.brunchies.dero.community.PlacementLike",
			"com.brunchies.dero.community.ProductLike",
			"com.brunchies.dero.community.PlacementBookmark",
			"com.brunchies.dero.community.PlacementBookmarkGroup",
			"com.brunchies.dero.community.Post",
			"com.brunchies.dero.community.PostLike",
			"com.brunchies.dero.community.PostComment",
			"com.brunchies.dero.community.DeskFeed",
			"com.brunchies.dero.community.DeskFeedLike",
			"com.brunchies.dero.community.DeskFeedComment",
			"com.brunchies.dero.user.Terms",
			"com.brunchies.dero.user.UserConsent",
			"com.brunchies.dero.user.Follow");

	/** 현재 위반 0건 (24/24). 굳히는 규칙이라 freeze하지 않는다. */
	@ArchTest
	@DisplayName("리포지토리는 애그리거트 루트에만 존재한다")
	void 리포지토리는_루트에만_있다(JavaClasses 클래스들) {
		classes()
				.that().areAssignableTo(Repository.class).and().areInterfaces()
				.should(애그리거트_루트를_다룬다())
				.because("루트를 우회해 자식을 직접 저장·삭제하면 루트가 지키던 불변식이 서비스로 샌다 (ADR-0007 결정 1~6)")
				.check(클래스들);
	}

	/** 현재 위반 0건. 굳히는 규칙. */
	@ArchTest
	@DisplayName("리포지토리 인터페이스는 ..repository.. 패키지에 산다")
	void 리포지토리는_repository_패키지에_산다(JavaClasses 클래스들) {
		classes()
				.that().areAssignableTo(Repository.class).and().areInterfaces()
				.should().resideInAPackage("..repository..")
				.because("컨트롤러→리포지토리 금지 규칙이 패키지 이름으로 판정되므로, "
						+ "리포지토리가 다른 패키지에 있으면 그 규칙이 조용히 뚫린다")
				.check(클래스들);
	}

	private static ArchCondition<JavaClass> 애그리거트_루트를_다룬다() {
		return new ArchCondition<>("애그리거트 루트를 다룬다") {
			@Override
			public void check(JavaClass 리포지토리, ConditionEvents events) {
				String 엔티티 = 다루는_엔티티(리포지토리);
				if (엔티티 == null) {
					// 제네릭 인자를 읽지 못한 경우. raw type으로 Repository를 상속했다는 뜻이라
					// 이것 자체가 잡아야 할 상태다 — 조용히 통과시키지 않는다.
					events.add(SimpleConditionEvent.violated(리포지토리,
							"%s 가 다루는 엔티티 타입을 읽을 수 없다 (raw type 상속?)".formatted(리포지토리.getName())));
					return;
				}
				boolean 만족 = 애그리거트_루트.contains(엔티티);
				events.add(new SimpleConditionEvent(리포지토리, 만족,
						"%s 가 %s 를 다룬다%s".formatted(리포지토리.getSimpleName(), 엔티티,
								만족 ? "" : " — 애그리거트 루트가 아니다")));
			}
		};
	}

	/** {@code XxxRepository extends JpaRepository<T, ID>} 에서 {@code T}의 FQCN을 뽑는다. */
	private static String 다루는_엔티티(JavaClass 리포지토리) {
		for (JavaType 상위 : 리포지토리.getInterfaces()) {
			if (!(상위 instanceof JavaParameterizedType 파라미터화)) {
				continue;
			}
			if (!파라미터화.toErasure().isAssignableTo(Repository.class)) {
				continue;
			}
			List<JavaType> 인자들 = 파라미터화.getActualTypeArguments();
			if (!인자들.isEmpty()) {
				return 인자들.get(0).toErasure().getName();
			}
		}
		return null;
	}
}
