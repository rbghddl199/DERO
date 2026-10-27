package com.brunchies.dero.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaConstructorCall;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.library.GeneralCodingRules;
import com.tngtech.archunit.library.freeze.FreezingArchRule;
import java.io.UncheckedIOException;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;

/**
 * ADR-0012 결정 4·9의 기계 강제.
 */
@AnalyzeClasses(packages = "com.brunchies.dero", importOptions = ImportOption.DoNotIncludeTests.class)
class ExceptionConventionTest {

	private static final Set<String> 금지된_예외 = Set.of(
			IllegalArgumentException.class.getName(),
			IllegalStateException.class.getName(),
			UncheckedIOException.class.getName());

	private static final DescribedPredicate<JavaConstructorCall> 금지된_예외를_만든다 =
			new DescribedPredicate<>("IllegalArgumentException·IllegalStateException·UncheckedIOException 을 생성한다") {
				@Override
				public boolean test(JavaConstructorCall 호출) {
					return 금지된_예외.contains(호출.getTargetOwner().getName());
				}
			};

	/**
	 * 현재 위반 12건 — {@code IllegalArgumentException} 8({@code CartItem} 2 / {@code Product} 2 /
	 * {@code Placement} 2 / {@code PlacedItem} 1 / {@code SocialProfileExtractor} 1),
	 * {@code UncheckedIOException} 3({@code LocalFileStoragePort}), {@code IllegalStateException} 1.
	 * 전부 {@code GlobalExceptionHandler}에 안 잡혀 500으로 나간다. → freeze
	 *
	 * <p>적용 범위 판단 — {@code global}·{@code infra}를 제외하지 <b>않았다</b>. 근거 둘:
	 * <ol>
	 *   <li>{@code .claude/rules/java/architecture.md} 규칙 4가 {@code UncheckedIOException}을 금지 목록에
	 *       명시했는데, 현재 그걸 던지는 곳은 {@code infra/LocalFileStoragePort} 뿐이다.
	 *       {@code infra}를 빼면 그 조항이 아무것도 안 가리키는 죽은 문장이 된다.</li>
	 *   <li>ADR-0012 "기존 코드 위반 목록"이 센 12건에 그 3건이 포함돼 있다.</li>
	 * </ol>
	 * "{@code infra}는 외부 라이브러리 경계라 다르다"는 반론은 성립한다. 하지만 그 "다르다"의 결론은
	 * "잡지 말자"가 아니라 "{@code infra}도 {@code BusinessException}으로 <b>번역</b>해서 내보내자"다 —
	 * 규칙 8이 정확히 그 번역을 try-catch의 유일한 허용 용도로 규정한다. 그래서 잡되 freeze한다.
	 */
	@ArchTest
	@DisplayName("Illegal*Exception·UncheckedIOException을 던지지 않는다 (BusinessException + ErrorCode만)")
	void 금지된_예외를_던지지_않는다(JavaClasses 클래스들) {
		FreezingArchRule.freeze(
				noClasses()
						.should().callConstructorWhere(금지된_예외를_만든다)
						.because("GlobalExceptionHandler가 잡는 건 BusinessException뿐이다. "
								+ "나머지는 code도 한국어 문구도 없이 500으로 나간다 (ADR-0012 결정 4)")
						.as("Illegal*Exception·UncheckedIOException 을 생성하지 않는다"))
				.check(클래스들);
	}

	/**
	 * 현재 위반 2건 — {@code auth/service/JwtIssuer.java:79,85} 의 {@code TEMP_DEBUG}
	 * {@code System.out.println}. → freeze
	 *
	 * <p>ArchUnit 내장 규칙. {@code System.out}·{@code System.err} 접근과
	 * {@code Throwable.printStackTrace()} 호출을 함께 잡는다.
	 */
	@ArchTest
	@DisplayName("System.out·System.err·printStackTrace를 쓰지 않는다")
	void 표준스트림을_쓰지_않는다(JavaClasses 클래스들) {
		FreezingArchRule.freeze(
				GeneralCodingRules.NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS
						.because("로깅 정책과 무관하게 stdout 유출이고 레벨·필터가 없다 (ADR-0012 결정 9)"))
				.check(클래스들);
	}
}
