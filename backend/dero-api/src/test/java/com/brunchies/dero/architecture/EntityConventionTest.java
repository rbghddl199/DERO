package com.brunchies.dero.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.fields;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noMethods;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaConstructor;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import java.util.function.Function;
import org.junit.jupiter.api.DisplayName;

/**
 * ADR-0012 결정 7·13, `.claude/rules/java/architecture.md` 규칙 7·16의 기계 강제.
 *
 * <p><b>중요 — Lombok 애노테이션은 ArchUnit이 볼 수 없다.</b>
 * {@code @Getter}·{@code @Setter}·{@code @NoArgsConstructor} 등 Lombok 애노테이션은 전부
 * {@code RetentionPolicy.SOURCE}라 클래스 파일에 남지 않는다(lombok 1.18.46의
 * {@code lombok/Setter.class}를 {@code javap -v}로 확인). ArchUnit은 바이트코드만 읽으므로
 * "이 클래스에 {@code @Setter}가 붙었는가"는 물어볼 수 없다. ADR-0012 "집행 수단" 절이 결정 7을
 * "금지 애노테이션·필수 애노테이션"으로 판정 가능하다고 적은 것은 이 점에서 틀렸다.
 *
 * <p>대신 <b>Lombok이 생성한 결과물</b>을 검사한다. {@code @Setter}는 {@code setXxx} 메서드를,
 * {@code @ToString}은 {@code toString()}을, {@code @EqualsAndHashCode}·{@code @Data}는
 * {@code equals}/{@code hashCode}/{@code canEqual}을,
 * {@code @NoArgsConstructor(access = PROTECTED)}는 protected 무인자 생성자를 바이트코드로 남긴다.
 * 결과물 검사는 오히려 더 강하다 — Lombok 없이 손으로 세터를 써도 똑같이 걸린다.
 *
 * <p>검사하지 않는 것: {@code @Getter}의 존재. Lombok이 없어도 손으로 쓴 게터와 구별되지 않고,
 * 게터가 없으면 호출부에서 즉시 컴파일 에러가 나므로 javac이 이미 강제한다.
 */
@AnalyzeClasses(packages = "com.brunchies.dero", importOptions = ImportOption.DoNotIncludeTests.class)
class EntityConventionTest {

	/** 현재 위반 0건 (44/44). 굳히는 규칙이라 freeze하지 않는다. */
	@ArchTest
	@DisplayName("모든 @ManyToOne에 fetch = FetchType.LAZY가 명시돼 있다")
	void ManyToOne은_LAZY다(JavaClasses 클래스들) {
		fields()
				.that().areAnnotatedWith(ManyToOne.class)
				.should(LAZY로_선언됐다("ManyToOne", 필드 -> 필드.getAnnotationOfType(ManyToOne.class).fetch()))
				.because("JPA 기본값이 EAGER라 빠뜨리면 애노테이션에 아무 표시 없이 조용히 N+1이 되고, "
						+ "목록 조회에서만 터져서 늦게 발견된다 (ADR-0012 결정 13)")
				.check(클래스들);
	}

	/** 현재 위반 0건. 굳히는 규칙. */
	@ArchTest
	@DisplayName("모든 @OneToOne에 fetch = FetchType.LAZY가 명시돼 있다")
	void OneToOne은_LAZY다(JavaClasses 클래스들) {
		fields()
				.that().areAnnotatedWith(OneToOne.class)
				.should(LAZY로_선언됐다("OneToOne", 필드 -> 필드.getAnnotationOfType(OneToOne.class).fetch()))
				.because("JPA 기본값이 EAGER다 (ADR-0012 결정 13)")
				.check(클래스들);
	}

	/** 현재 위반 0건. {@code @Setter}가 만드는 {@code setXxx} 메서드를 금지해 {@code @Setter}를 실질적으로 막는다. */
	@ArchTest
	@DisplayName("엔티티에 세터가 없다 (@Setter 금지)")
	void 엔티티에_세터가_없다(JavaClasses 클래스들) {
		noMethods()
				.that().areDeclaredInClassesThat().areAnnotatedWith(Entity.class)
				.should().haveNameMatching("set[A-Z].*")
				.because("세터는 불변식을 우회한다. 상태 변경은 의미 있는 이름의 도메인 메서드로만 한다 (ADR-0012 결정 7)")
				.check(클래스들);
	}

	/** 현재 위반 0건. {@code @Data}·{@code @EqualsAndHashCode}·{@code @ToString}이 만드는 메서드를 금지한다. */
	@ArchTest
	@DisplayName("엔티티가 equals·hashCode·toString을 선언하지 않는다 (@Data·@EqualsAndHashCode·@ToString 금지)")
	void 엔티티가_Object_메서드를_재정의하지_않는다(JavaClasses 클래스들) {
		noMethods()
				.that().areDeclaredInClassesThat().areAnnotatedWith(Entity.class)
				.should().haveNameMatching("equals|hashCode|toString|canEqual")
				.because("@EqualsAndHashCode·@ToString은 지연 연관을 건드려 N+1과 무한 재귀를 만든다 (ADR-0012 결정 7)")
				.check(클래스들);
	}

	/**
	 * 현재 위반 0건 (31/31). {@code @NoArgsConstructor(access = PROTECTED)}가 남기는 바이트코드를 본다.
	 * 애노테이션 인자를 직접 못 읽는 대신 그 결과인 생성자 접근 제어자를 읽으므로,
	 * {@code access}를 {@code PUBLIC}으로 바꾸거나 애노테이션을 지우면 둘 다 여기서 걸린다.
	 */
	@ArchTest
	@DisplayName("@Entity는 public이 아닌 무인자 생성자를 갖는다 (@NoArgsConstructor(access = PROTECTED))")
	void 엔티티는_보호된_기본생성자를_갖는다(JavaClasses 클래스들) {
		classes()
				.that().areAnnotatedWith(Entity.class)
				.should(public이_아닌_무인자_생성자를_갖는다())
				.because("JPA가 프록시용 기본 생성자를 요구하고, public이면 아무나 빈 엔티티를 만든다 (ADR-0012 결정 7)")
				.check(클래스들);
	}

	private static ArchCondition<JavaClass> public이_아닌_무인자_생성자를_갖는다() {
		return new ArchCondition<>("public이 아닌 무인자 생성자를 갖는다") {
			@Override
			public void check(JavaClass 엔티티, ConditionEvents events) {
				JavaConstructor 무인자 = 엔티티.getConstructors().stream()
						.filter(생성자 -> 생성자.getRawParameterTypes().isEmpty())
						.findFirst()
						.orElse(null);
				if (무인자 == null) {
					events.add(SimpleConditionEvent.violated(엔티티,
							"%s 에 무인자 생성자가 없다".formatted(엔티티.getName())));
					return;
				}
				boolean 만족 = !무인자.getModifiers().contains(JavaModifier.PUBLIC);
				events.add(new SimpleConditionEvent(엔티티, 만족,
						"%s 의 무인자 생성자가 public%s".formatted(엔티티.getName(), 만족 ? "이 아니다" : "이다")));
			}
		};
	}

	private static ArchCondition<JavaField> LAZY로_선언됐다(String 애노테이션명, Function<JavaField, FetchType> 읽기) {
		return new ArchCondition<>("@%s 가 fetch = FetchType.LAZY 로 선언됐다".formatted(애노테이션명)) {
			@Override
			public void check(JavaField 필드, ConditionEvents events) {
				FetchType fetch = 읽기.apply(필드);
				boolean 만족 = fetch == FetchType.LAZY;
				events.add(new SimpleConditionEvent(필드, 만족,
						"%s.%s 의 @%s fetch = %s".formatted(
								필드.getOwner().getSimpleName(), 필드.getName(), 애노테이션명, fetch)));
			}
		};
	}
}
