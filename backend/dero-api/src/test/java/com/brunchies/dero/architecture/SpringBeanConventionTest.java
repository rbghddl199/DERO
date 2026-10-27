package com.brunchies.dero.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.fields;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noFields;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import org.junit.jupiter.api.DisplayName;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Controller;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.RestController;

/**
 * ADR-0012 결정 10·13(스프링 빈 관례)의 기계 강제.
 *
 * <p><b>결정 13의 "{@code @RequiredArgsConstructor}를 쓴다"는 ArchUnit으로 판정할 수 없다.</b>
 * Lombok 애노테이션은 {@code RetentionPolicy.SOURCE}라 바이트코드에 남지 않고
 * ({@code EntityConventionTest} 주석 참조), Lombok이 생성한 생성자와 손으로 쓴 생성자는
 * <b>바이트코드에서 완전히 같다</b>. "손으로 쓴 생성자인가"는 원리적으로 물어볼 수 없다.
 *
 * <p>그래서 결정 13이 실제로 지키려는 <b>불변식</b>만 검사한다 —
 * ① 빈의 인스턴스 필드는 전부 {@code final}이고 ② {@code @Autowired} 필드 주입이 없다.
 * 이 둘이면 "테스트에서 못 갈아끼우고 순환 의존을 숨긴다"는 결정 13의 근거가 막힌다.
 * 생성자를 Lombok으로 쓰느냐 손으로 쓰느냐는 <b>사람 리뷰가 봐야 한다</b>
 * (현재 빈 16개 중 15개가 수동 생성자 — 정리는 별도 티켓).
 */
@AnalyzeClasses(packages = "com.brunchies.dero", importOptions = ImportOption.DoNotIncludeTests.class)
class SpringBeanConventionTest {

	/**
	 * "DB를 만지는가"의 근사 — 리포지토리 패키지에 직접 의존하는가. ArchUnit의
	 * {@code dependOnClassesThat()}은 {@code should()} 쪽에만 있어 {@code that()} 쪽은 술어로 쓴다.
	 */
	private static final DescribedPredicate<JavaClass> 리포지토리에_의존한다 =
			new DescribedPredicate<>("리포지토리에 의존하는") {
				@Override
				public boolean test(JavaClass 클래스) {
					return 클래스.getDirectDependenciesFromSelf().stream()
							.anyMatch(의존 -> 의존.getTargetClass().getPackageName().contains(".repository"));
				}
			};

	/**
	 * 현재 위반 <b>0건</b>. freeze하지 않는다.
	 *
	 * <p><b>대상은 "DB를 만지는 서비스"다</b> — 리포지토리에 의존하는 {@code @Service}로 좁힌다
	 * (2026-07-30, 박동규 지시로 규칙 축소). 처음엔 {@code @Service} 전체를 대상으로 걸었더니 위반이
	 * 3건 나왔는데, 셋 다({@code JwtIssuer}·{@code RefreshTokenService}·{@code ProductImageService})
	 * <b>리포지토리를 하나도 주입받지 않는다</b> — JWT 발급, Redis 리프레시 토큰, S3 presign 발급이다.
	 * 트랜잭션 경계가 없는 곳에 {@code @Transactional}을 붙이는 건 의미 없는 장식이고, 그런 규칙은
	 * 지켜져도 아무것도 안 막는다.
	 *
	 * <p>이름으로 예외 처리하지 않고 <b>의존 관계로 표현한 이유</b>: 셋 중 하나가 나중에 리포지토리를
	 * 물면 규칙이 자동으로 다시 걸린다. 이름 목록은 그날 조용히 낡는다.
	 *
	 * <p>한계: 클래스 레벨이 {@code readOnly = true} 인지까지는 검사하지 않는다.
	 * {@code @Transactional}은 RUNTIME 애노테이션이라 {@code readOnly} 값을 읽을 수는 있지만,
	 * "쓰기 메서드만 재선언"의 '쓰기 메서드'를 기계가 판정할 수 없다. 반쪽만 강제하면
	 * {@code readOnly}를 형식적으로 붙이고 메서드 재선언을 빠뜨리는 쪽으로 몰린다
	 * ({@code PlacementService.saveThumbnail}이 이미 그 형태다 — {@code readOnly}인데 스토리지에 쓴다).
	 * 존재 여부까지만 막고 배치는 사람 리뷰에 남긴다.
	 */
	@ArchTest
	@DisplayName("리포지토리를 쓰는 @Service는 클래스 레벨 @Transactional을 갖는다")
	void 리포지토리를_쓰는_서비스는_Transactional을_갖는다(JavaClasses 클래스들) {
		classes()
				.that().areAnnotatedWith(Service.class)
				.and(리포지토리에_의존한다)
				.should().beAnnotatedWith(Transactional.class)
				.because("안전 기본값이 읽기라 빠뜨려도 데이터가 안 깨진다. "
						+ "반대로 하면 빠뜨린 순간 조용히 쓰기가 열린다 (ADR-0012 결정 10). "
						+ "DB를 안 만지는 서비스는 트랜잭션 경계 자체가 없어 대상이 아니다")
				.as("리포지토리를 쓰는 @Service는 @Transactional을 갖는다")
				.check(클래스들);
	}

	/** 현재 위반 0건. 굳히는 규칙이라 freeze하지 않는다. */
	@ArchTest
	@DisplayName("스프링 빈의 인스턴스 필드는 전부 final이다 (생성자 주입)")
	void 빈의_필드는_final이다(JavaClasses 클래스들) {
		fields()
				.that().areDeclaredInClassesThat().areAnnotatedWith(Service.class)
				.or().areDeclaredInClassesThat().areAnnotatedWith(RestController.class)
				.or().areDeclaredInClassesThat().areAnnotatedWith(Controller.class)
				.or().areDeclaredInClassesThat().areAnnotatedWith(Component.class)
				.should().beFinal()
				.because("final이 아니면 세터·필드 주입이 가능해지고, 그러면 테스트에서 못 갈아끼우고 "
						+ "순환 의존을 숨긴다 (ADR-0012 결정 13)")
				.check(클래스들);
	}

	/** 현재 위반 0건. 굳히는 규칙. */
	@ArchTest
	@DisplayName("@Autowired 필드 주입을 쓰지 않는다")
	void 필드_주입을_쓰지_않는다(JavaClasses 클래스들) {
		noFields()
				.should().beAnnotatedWith(Autowired.class)
				.because("@Autowired 필드 주입은 테스트에서 못 갈아끼우고 순환 의존을 숨긴다 (ADR-0012 결정 13)")
				.check(클래스들);
	}
}
