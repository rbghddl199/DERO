package com.brunchies.dero.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.library.freeze.FreezingArchRule;
import org.junit.jupiter.api.DisplayName;

/**
 * ADR-0007 결정 7 "의존 방향 — 위에서 아래로만"의 기계 강제.
 *
 * <pre>
 * community · commerce · image   (서로도 모른다)
 *         ↓
 *      placement
 *         ↓
 *    product · auth              (같은 층 — 서로 모른다)
 *         ↓
 *    user · catalog              (같은 층 — 서로 모른다)
 *
 * infra  : 도메인을 모른다. 도메인이 infra의 인터페이스를 부른다.
 * global : 아무도 모른다. 전부가 global을 부른다.
 * </pre>
 *
 * ADR-0007은 "역류가 실제로 한 번 나면 ArchUnit을 넣는다"는 트리거를 걸어뒀고,
 * {@code global/security/SecurityConfig}가 {@code auth.service}를 import하면서 그 트리거가 발동했다.
 *
 * <p>{@code layeredArchitecture()}를 쓰지 않았다 — 그 API는 "같은 층끼리 서로 모른다"
 * (product↔auth, user↔catalog)를 표현하지 못하고, 규칙이 통째라 일부만 freeze할 수도 없다.
 * 대신 패키지마다 "절대 의존하면 안 되는 목록"을 한 줄씩 적는다.
 *
 * <p>규칙을 필드가 아니라 {@code @ArchTest} 메서드로 쓴 이유: {@code @DisplayName}의
 * {@code @Target}에 {@code FIELD}가 없어 필드에는 붙일 수 없다 (ADR-0012 결정 12가 요구한다).
 */
@AnalyzeClasses(packages = "com.brunchies.dero", importOptions = ImportOption.DoNotIncludeTests.class)
class LayerDependencyTest {

	private static final String USER = "..dero.user..";
	private static final String CATALOG = "..dero.catalog..";
	private static final String AUTH = "..dero.auth..";
	private static final String PRODUCT = "..dero.product..";
	private static final String PLACEMENT = "..dero.placement..";
	private static final String COMMUNITY = "..dero.community..";
	private static final String COMMERCE = "..dero.commerce..";
	private static final String IMAGE = "..dero.image..";
	private static final String INFRA = "..dero.infra..";
	private static final String GLOBAL = "..dero.global..";

	/**
	 * 현재 위반 2건 — {@code global/security/SecurityConfig.java:3,4} 가
	 * {@code auth.service.OAuth2LoginSuccessHandler}·{@code OAuth2LoginFailureHandler} 를 import한다.
	 * 이 두 건이 ADR-0007의 도입 트리거 그 자체다. → freeze
	 */
	@ArchTest
	@DisplayName("global은 도메인·infra를 모른다 (전부가 global을 부른다)")
	void global은_도메인을_모른다(JavaClasses 클래스들) {
		FreezingArchRule.freeze(
				noClasses()
						.that().resideInAPackage(GLOBAL)
						.should().dependOnClassesThat()
						.resideInAnyPackage(USER, CATALOG, AUTH, PRODUCT, PLACEMENT, COMMUNITY, COMMERCE, IMAGE, INFRA)
						.because("global은 프레임워크 결합 계층이다. 도메인을 알면 도메인을 떼어낼 수 없다 (ADR-0007 결정 7)")
						.as("global은 도메인·infra에 의존하지 않는다"))
				.check(클래스들);
	}

	/** 현재 위반 0건 — 굳히는 규칙이라 freeze하지 않는다. */
	@ArchTest
	@DisplayName("infra는 도메인을 모른다 (도메인이 infra의 인터페이스를 부른다)")
	void infra는_도메인을_모른다(JavaClasses 클래스들) {
		noClasses()
				.that().resideInAPackage(INFRA)
				.should().dependOnClassesThat()
				.resideInAnyPackage(USER, CATALOG, AUTH, PRODUCT, PLACEMENT, COMMUNITY, COMMERCE, IMAGE)
				.because("infra는 외부 경계(스토리지·AI)다. 도메인을 알면 의존 화살표가 뒤집힌다 (ADR-0007 결정 7)")
				.check(클래스들);
	}

	/** 현재 위반 0건. */
	@ArchTest
	@DisplayName("user는 위 계층과 같은 층(catalog)을 모른다")
	void user는_위를_모른다(JavaClasses 클래스들) {
		noClasses()
				.that().resideInAPackage(USER)
				.should().dependOnClassesThat()
				.resideInAnyPackage(CATALOG, AUTH, PRODUCT, PLACEMENT, COMMUNITY, COMMERCE, IMAGE)
				.because("user는 최하층이고 catalog와 같은 층이다 (ADR-0007 결정 7)")
				.check(클래스들);
	}

	/** 현재 위반 0건. */
	@ArchTest
	@DisplayName("catalog는 위 계층과 같은 층(user)을 모른다")
	void catalog는_위를_모른다(JavaClasses 클래스들) {
		noClasses()
				.that().resideInAPackage(CATALOG)
				.should().dependOnClassesThat()
				.resideInAnyPackage(USER, AUTH, PRODUCT, PLACEMENT, COMMUNITY, COMMERCE, IMAGE)
				.because("catalog는 최하층이고 user와 같은 층이다 (ADR-0007 결정 7)")
				.check(클래스들);
	}

	/** 현재 위반 0건. */
	@ArchTest
	@DisplayName("auth는 위 계층과 같은 층(product)을 모른다 — user·catalog만 안다")
	void auth는_위를_모른다(JavaClasses 클래스들) {
		noClasses()
				.that().resideInAPackage(AUTH)
				.should().dependOnClassesThat()
				.resideInAnyPackage(PRODUCT, PLACEMENT, COMMUNITY, COMMERCE, IMAGE)
				.because("auth와 product는 같은 층이고 서로 모른다 (ADR-0007 결정 7)")
				.check(클래스들);
	}

	/** 현재 위반 0건. */
	@ArchTest
	@DisplayName("product는 위 계층과 같은 층(auth)을 모른다 — user·catalog만 안다")
	void product는_위를_모른다(JavaClasses 클래스들) {
		noClasses()
				.that().resideInAPackage(PRODUCT)
				.should().dependOnClassesThat()
				.resideInAnyPackage(AUTH, PLACEMENT, COMMUNITY, COMMERCE, IMAGE)
				.because("product가 placement를 import하면 잘못된 것이다 (ADR-0007 결정 7)")
				.check(클래스들);
	}

	/** 현재 위반 0건. */
	@ArchTest
	@DisplayName("placement는 위 계층(community·commerce·image)을 모른다")
	void placement는_위를_모른다(JavaClasses 클래스들) {
		noClasses()
				.that().resideInAPackage(PLACEMENT)
				.should().dependOnClassesThat().resideInAnyPackage(COMMUNITY, COMMERCE, IMAGE)
				.because("placement는 community·commerce·image 아래 층이다 (ADR-0007 결정 7)")
				.check(클래스들);
	}

	/** 현재 위반 0건. 최상층 3개는 placement 위에 나란히 얹힌 독립 기능이라 서로도 모른다. */
	@ArchTest
	@DisplayName("최상층 community·commerce·image는 서로를 모른다")
	void 최상층은_서로를_모른다(JavaClasses 클래스들) {
		noClasses()
				.that().resideInAPackage(COMMUNITY)
				.should().dependOnClassesThat().resideInAnyPackage(COMMERCE, IMAGE)
				.because("최상층 3개는 나란히 얹힌 독립 기능이다 (ADR-0007 결정 7)")
				.check(클래스들);
		noClasses()
				.that().resideInAPackage(COMMERCE)
				.should().dependOnClassesThat().resideInAnyPackage(COMMUNITY, IMAGE)
				.because("최상층 3개는 나란히 얹힌 독립 기능이다 (ADR-0007 결정 7)")
				.check(클래스들);
		noClasses()
				.that().resideInAPackage(IMAGE)
				.should().dependOnClassesThat().resideInAnyPackage(COMMUNITY, COMMERCE)
				.because("최상층 3개는 나란히 얹힌 독립 기능이다 (ADR-0007 결정 7)")
				.check(클래스들);
	}

	/**
	 * 현재 위반 0건. 위 규칙들은 <b>톱레벨 패키지 10개를 손으로 나열</b>해서 성립한다 —
	 * 11번째 패키지가 생기면 아무 규칙에도 안 걸려 조용히 무법지대가 된다.
	 * 그래서 "알려진 10개 밖에 클래스가 있으면 실패"를 그물로 하나 더 친다.
	 * 새 톱레벨 패키지를 만드는 사람은 <b>이 파일을 반드시 고치게 된다</b>.
	 *
	 * <p>{@code slices().should().beFreeOfCycles()}를 쓰지 않았다. 지금
	 * {@code SecurityConfig} 위반 때문에 {@code auth ↔ global} 순환이 실제로 있어 freeze가 필요한데,
	 * 순환 규칙의 위반 텍스트는 <b>두 슬라이스 사이의 모든 의존 간선을 나열</b>한다 —
	 * {@code auth}에 {@code BusinessException}을 쓰는 줄이 하나 늘 때마다 baseline이 어긋나
	 * 무관한 커밋이 빨개진다. 위 10개 규칙이 순환을 이미 전부 덮으므로 그 비용을 안 산다.
	 */
	@ArchTest
	@DisplayName("모든 클래스는 알려진 톱레벨 패키지 10개 안에 있다")
	void 알려지지_않은_톱레벨_패키지가_없다(JavaClasses 클래스들) {
		classes()
				.should().resideInAnyPackage(
						USER, CATALOG, AUTH, PRODUCT, PLACEMENT, COMMUNITY, COMMERCE, IMAGE, INFRA, GLOBAL,
						"com.brunchies.dero")
				.because("위 의존 방향 규칙들은 톱레벨 패키지를 손으로 나열해서 성립한다. "
						+ "목록에 없는 패키지가 생기면 어떤 규칙에도 안 걸린다 (ADR-0007 결정 7)")
				.check(클래스들);
	}
}
