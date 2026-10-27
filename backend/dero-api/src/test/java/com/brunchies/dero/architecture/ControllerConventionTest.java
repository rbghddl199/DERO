package com.brunchies.dero.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import com.tngtech.archunit.library.freeze.FreezingArchRule;
import org.junit.jupiter.api.DisplayName;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * ADR-0012 결정 1·5·13, `.claude/rules/java/architecture.md` 규칙 1·5·17의 기계 강제.
 */
@AnalyzeClasses(packages = "com.brunchies.dero", importOptions = ImportOption.DoNotIncludeTests.class)
class ControllerConventionTest {

	/**
	 * {@code @GetMapping}·{@code @PostMapping}… 은 전부 {@code @RequestMapping}으로 메타 애노테이션돼 있다.
	 * 하나씩 나열하는 대신 메타 애노테이션 한 방으로 잡으면 새 매핑 애노테이션이 생겨도 목록을 안 고쳐도 된다.
	 */
	private static final DescribedPredicate<JavaMethod> HTTP_핸들러 =
			new DescribedPredicate<>("@RequestMapping 계열 애노테이션이 붙었다") {
				@Override
				public boolean test(JavaMethod 메서드) {
					return 메서드.isAnnotatedWith(RequestMapping.class)
							|| 메서드.isMetaAnnotatedWith(RequestMapping.class);
				}
			};

	/**
	 * 현재 위반 <b>0건</b>. 감사 시점(2026-07-30) 위반 7건을 freeze로 받아두고 하나씩 정리해 왔고,
	 * 마지막 한 건이던 {@code AuthController.refresh}가 없어지면서 baseline이 비었다. 그래서
	 * <b>freeze를 걷는다</b> — 빈 baseline을 남겨 두면 나중의 회귀를 흡수해버릴 자리가 계속 남는다
	 * ({@code archunit.properties} 주석의 원칙).
	 */
	@ArchTest
	@DisplayName("컨트롤러 핸들러는 항상 ResponseEntity를 반환한다")
	void 핸들러는_ResponseEntity를_반환한다(JavaClasses 클래스들) {
		methods()
				.that(HTTP_핸들러)
				.should().haveRawReturnType(ResponseEntity.class)
				.because("반환 타입 하나만 보면 되는 기계 판정으로 환원된다. 나중에 Location·Cache-Control "
						+ "헤더나 201/204가 필요해져도 시그니처가 안 바뀐다 (ADR-0012 결정 1)")
				.as("HTTP 핸들러는 ResponseEntity를 반환한다")
				.check(클래스들);
	}

	/**
	 * 현재 위반 1곳 — {@code auth/controller/AuthController.java:25} 가 {@code UserRepository}를
	 * 주입받아 {@code :57}에서 직접 호출한다. → freeze
	 * (baseline에는 3줄로 기록된다 — ArchUnit은 클래스가 아니라 <b>의존 간선</b>을 센다:
	 * 생성자 파라미터·필드 타입·메서드 호출.)
	 */
	@ArchTest
	@DisplayName("컨트롤러는 리포지토리를 직접 의존하지 않는다")
	void 컨트롤러는_리포지토리를_모른다(JavaClasses 클래스들) {
		FreezingArchRule.freeze(
				noClasses()
						.that().resideInAPackage("..controller..")
						.should().dependOnClassesThat().resideInAPackage("..repository..")
						.because("open-in-view: false다. 컨트롤러에서 받은 엔티티의 지연 연관을 읽는 순간 "
								+ "트랜잭션이 이미 닫혀 있어 LazyInitializationException으로 죽는다 (ADR-0012 결정 5)")
						.as("컨트롤러는 리포지토리에 의존하지 않는다"))
				.check(클래스들);
	}

	/** 현재 위반 0건 (5/5). 굳히는 규칙이라 freeze하지 않는다. */
	@ArchTest
	@DisplayName("컨트롤러의 @RequestMapping 경로는 /api/v1 로 시작한다")
	void API_경로는_v1_접두를_갖는다(JavaClasses 클래스들) {
		classes()
				.that().areAnnotatedWith(RequestMapping.class)
				.should(경로가_접두로_시작한다("/api/v1"))
				.because("버전 없이 나간 경로는 브레이킹 체인지 때 되돌릴 방법이 없다 (ADR-0012 결정 13)")
				.check(클래스들);
	}

	private static ArchCondition<JavaClass> 경로가_접두로_시작한다(String 접두) {
		return new ArchCondition<>("경로가 '%s'로 시작한다".formatted(접두)) {
			@Override
			public void check(JavaClass 클래스, ConditionEvents events) {
				String[] 경로들 = 클래스.getAnnotationOfType(RequestMapping.class).value();
				if (경로들.length == 0) {
					events.add(SimpleConditionEvent.violated(클래스,
							"%s 의 @RequestMapping에 경로가 없다".formatted(클래스.getName())));
					return;
				}
				for (String 경로 : 경로들) {
					boolean 만족 = 경로.startsWith(접두);
					events.add(new SimpleConditionEvent(클래스, 만족,
							"%s 의 경로 '%s'".formatted(클래스.getName(), 경로)));
				}
			}
		};
	}
}
