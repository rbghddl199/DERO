package com.brunchies.dero.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.library.freeze.FreezingArchRule;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;

/**
 * ADR-0012 결정 12({@code @DisplayName} 한글 필수)의 기계 강제.
 *
 * <p>이 클래스만 {@code importOptions}를 지정하지 않는다 — 검사 대상이 테스트 코드이기 때문이다.
 * 다른 아키텍처 테스트는 전부 {@code DoNotIncludeTests}로 프로덕션 코드만 본다.
 *
 * <p>검사하지 않는 것: {@code @DisplayName}의 <b>내용이 한글인지</b>. 애노테이션 값은 읽을 수 있지만
 * "한글인가"를 정규식으로 판정하면 고유명사·API 경로가 든 정상 이름이 걸린다. 존재까지만 막는다.
 */
@AnalyzeClasses(packages = "com.brunchies.dero")
class TestConventionTest {

	/**
	 * 현재 위반 1건 — {@code DeroApiApplicationTests.contextLoads()} (스프링 이니셜라이저가 만든 기본 테스트).
	 * 105개 {@code @Test} 중 이 하나뿐이다. → freeze
	 */
	@ArchTest
	@DisplayName("@Test·@ParameterizedTest 메서드에는 @DisplayName이 있다")
	void 테스트에는_DisplayName이_있다(JavaClasses 클래스들) {
		FreezingArchRule.freeze(
				methods()
						.that().areAnnotatedWith(Test.class)
						.or().areAnnotatedWith(ParameterizedTest.class)
						.should().beAnnotatedWith(DisplayName.class)
						.because("실패 리포트를 읽는 사람이 메서드명 파싱 없이 무엇이 깨졌는지 알아야 한다 (ADR-0012 결정 12)")
						.as("@Test 메서드는 @DisplayName을 갖는다"))
				.check(클래스들);
	}
}
