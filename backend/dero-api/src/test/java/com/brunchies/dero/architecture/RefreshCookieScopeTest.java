package com.brunchies.dero.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;

import com.brunchies.dero.auth.service.RefreshCookieWriter;
import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * ADR-0016 결정 4의 기계 강제 — <b>리프레시 쿠키를 읽는 모든 핸들러의 매핑 경로는 그 쿠키
 * {@code Path}의 하위여야 한다.</b>
 *
 * <p><b>왜 이 불변식이 필요했나(실사고).</b> 리프레시 쿠키 {@code Path}가
 * {@code /api/v1/auth/refresh}였다. RFC 6265 §5.1.4 path-match는 요청 경로
 * {@code /api/v1/auth/logout}을 그 쿠키 path에 매치시키지 않는다 — 동일하지도 접두사도 아니다.
 * 그래서 브라우저가 로그아웃 요청에 쿠키를 아예 안 실었고,
 * {@code AuthController#logout}은 항상 {@code refreshCookie == null}을 받아
 * {@code RefreshTokenService#revokeAll}을 <b>한 번도 부르지 못했다</b>. 쿠키는 {@code Set-Cookie}가
 * 지우니 화면상 로그아웃으로 보이지만 Redis {@code refresh:{userId}} Set은 TTL 14일이 다 할 때까지
 * 살아 있었다(ADR-0005 결정 3 개정 절).
 *
 * <p><b>왜 "브라우저로 밟아 보기"가 아니라 불변식인가.</b> 브라우저 스펙(Playwright)은 그 스펙을 쓴
 * 엔드포인트만 잡는다 — 앞으로 추가될 엔드포인트는 스펙이 없으니 그냥 통과한다. 불변식은 반대로,
 * 리프레시 쿠키를 읽는 <b>모든</b> 핸들러를 대상으로 삼기 때문에 아직 쓰이지도 않은 코드까지 미리
 * 잡는다. MockMvc는 쿠키 path 스코핑을 흉내내지 않고 Playwright 스펙은 그 엔드포인트를 204로
 * 스텁하므로, 실제로 이 사고를 볼 수 있는 층이 여기 말고 없었다(ADR-0016 "맥락" 표).
 *
 * <p><b>왜 ArchUnit DSL인가(리플렉션 일반 테스트 대신).</b> 검사 대상이 "애노테이션이 붙은 메서드"라
 * ArchUnit의 {@code methods().that(...).should(...)}에 그대로 얹힌다. {@code architecture/} 아래 기존
 * 7개 테스트와 같은 자리·같은 실행 경로에 있어야 "컨벤션은 여기서 기계로 강제한다"는 규칙이
 * 한 곳으로 모인다. 대상 클래스를 손으로 나열할 필요도 없다.
 *
 * <p>{@code freeze}하지 않는다 — 현재 위반 0건이고, baseline은 나중의 회귀를 흡수해버린다
 * ({@code archunit.properties} 주석의 원칙). 대상 핸들러가 하나도 없으면 ArchUnit 기본값
 * ({@code archunit.enableEmptyShould=false})이 실패시킨다 — 규칙이 조용히 무의미해지는 것도 사고다.
 */
@AnalyzeClasses(packages = "com.brunchies.dero", importOptions = ImportOption.DoNotIncludeTests.class)
class RefreshCookieScopeTest {

	/**
	 * {@code @CookieValue(name = RefreshCookieWriter.COOKIE_NAME)}은 컴파일 시점에 상수가 인라인되므로
	 * 바이트코드에는 리터럴 {@code "refreshToken"}이 남는다 — 상수를 쓰든 문자열을 직접 쓰든 똑같이 잡힌다.
	 * {@code @CookieValue}는 {@code value}와 {@code name}이 서로의 별칭이라 둘 다 본다.
	 */
	private static final DescribedPredicate<JavaMethod> 리프레시_쿠키를_읽는다 =
			new DescribedPredicate<>("@CookieValue로 '%s' 쿠키를 읽는다".formatted(RefreshCookieWriter.COOKIE_NAME)) {
				@Override
				public boolean test(JavaMethod 메서드) {
					return 메서드.getParameters().stream()
							.flatMap(파라미터 -> 파라미터.getAnnotations().stream())
							.filter(애노테이션 -> 애노테이션.getRawType().isEquivalentTo(CookieValue.class))
							.flatMap(애노테이션 -> 문자열들(애노테이션, "value", "name").stream())
							.anyMatch(RefreshCookieWriter.COOKIE_NAME::equals);
				}
			};

	@ArchTest
	@DisplayName("리프레시 쿠키를 읽는 핸들러의 매핑 경로는 쿠키 Path의 하위다")
	void 리프레시_쿠키_핸들러는_쿠키_path_아래에_산다(JavaClasses 클래스들) {
		methods()
				.that(리프레시_쿠키를_읽는다)
				.should(매핑_경로가_쿠키_path_아래에_있다())
				.because("path-match(RFC 6265 §5.1.4)에서 벗어나면 브라우저가 그 요청에 쿠키를 아예 안 싣는다. "
						+ "핸들러는 조용히 null을 받고, 서버는 에러 없이 '할 일을 안 한' 상태가 된다 (ADR-0016 결정 4)")
				.as("리프레시 쿠키를 읽는 핸들러는 쿠키 path '%s'의 하위에 매핑된다"
						.formatted(RefreshCookieWriter.COOKIE_PATH))
				.check(클래스들);
	}

	private static ArchCondition<JavaMethod> 매핑_경로가_쿠키_path_아래에_있다() {
		return new ArchCondition<>("매핑 경로가 쿠키 path '%s'의 하위다".formatted(RefreshCookieWriter.COOKIE_PATH)) {
			@Override
			public void check(JavaMethod 메서드, ConditionEvents events) {
				List<String> 경로들 = 유효_매핑_경로들(메서드);
				if (경로들.isEmpty()) {
					events.add(SimpleConditionEvent.violated(메서드,
							"%s 는 리프레시 쿠키를 읽는데 @RequestMapping 계열 매핑이 없다".formatted(메서드.getFullName())));
					return;
				}
				for (String 경로 : 경로들) {
					boolean 만족 = path_match(경로, RefreshCookieWriter.COOKIE_PATH);
					events.add(new SimpleConditionEvent(메서드, 만족,
							"%s 의 매핑 경로 '%s' (쿠키 path '%s')"
									.formatted(메서드.getFullName(), 경로, RefreshCookieWriter.COOKIE_PATH)));
				}
			}
		};
	}

	/**
	 * RFC 6265 §5.1.4 path-match. 단순 {@code startsWith}가 아니다 — {@code /api/v1/authority}는
	 * {@code /api/v1/auth}로 시작하지만 브라우저는 쿠키를 안 싣는다. 경계가 세그먼트여야 매치다.
	 */
	private static boolean path_match(String 요청_경로, String 쿠키_path) {
		if (!요청_경로.startsWith(쿠키_path)) {
			return false;
		}
		return 요청_경로.length() == 쿠키_path.length()
				|| 쿠키_path.endsWith("/")
				|| 요청_경로.charAt(쿠키_path.length()) == '/';
	}

	/** 클래스 {@code @RequestMapping} × 메서드 매핑의 곱. 둘 중 하나라도 경로를 여러 개 쓰면 전부 검사한다. */
	private static List<String> 유효_매핑_경로들(JavaMethod 메서드) {
		Optional<JavaAnnotation<JavaMethod>> 메서드_매핑 = 메서드.getAnnotations().stream()
				.filter(RefreshCookieScopeTest::매핑_애노테이션인가)
				.findFirst();
		if (메서드_매핑.isEmpty()) {
			return List.of();
		}

		List<String> 결과 = new ArrayList<>();
		for (String 클래스_경로 : 클래스_경로들(메서드.getOwner())) {
			for (String 메서드_경로 : 경로_또는_빈값(메서드_매핑.get())) {
				결과.add(이어붙이기(클래스_경로, 메서드_경로));
			}
		}
		return List.copyOf(결과);
	}

	private static List<String> 클래스_경로들(JavaClass 클래스) {
		return 클래스.getAnnotations().stream()
				.filter(RefreshCookieScopeTest::매핑_애노테이션인가)
				.findFirst()
				.map(RefreshCookieScopeTest::경로_또는_빈값)
				.orElse(List.of(""));
	}

	/**
	 * {@code @GetMapping}·{@code @PostMapping}… 은 전부 {@code @RequestMapping}으로 메타 애노테이션돼
	 * 있다 — 하나씩 나열하지 않는다({@code ControllerConventionTest}와 같은 수법).
	 */
	private static boolean 매핑_애노테이션인가(JavaAnnotation<?> 애노테이션) {
		JavaClass 타입 = 애노테이션.getRawType();
		return 타입.isEquivalentTo(RequestMapping.class) || 타입.isAnnotatedWith(RequestMapping.class);
	}

	/** {@code value}·{@code path}는 서로의 별칭이라 어느 쪽에 썼는지 알 수 없다 — 둘 다 모은다. */
	private static List<String> 경로_또는_빈값(JavaAnnotation<?> 애노테이션) {
		List<String> 경로들 = 문자열들(애노테이션, "value", "path");
		return 경로들.isEmpty() ? List.of("") : 경로들;
	}

	private static List<String> 문자열들(JavaAnnotation<?> 애노테이션, String... 멤버들) {
		List<String> 값들 = new ArrayList<>();
		for (String 멤버 : 멤버들) {
			애노테이션.get(멤버).ifPresent(값 -> {
				if (값 instanceof Object[] 배열) {
					Arrays.stream(배열).map(String::valueOf).filter(문자열 -> !문자열.isEmpty()).forEach(값들::add);
				} else if (값 instanceof String 문자열 && !문자열.isEmpty()) {
					값들.add(문자열);
				}
			});
		}
		return List.copyOf(값들);
	}

	/** {@code "/api/v1/auth" + "/logout"} → {@code "/api/v1/auth/logout"}. 슬래시 중복·끝 슬래시를 정리한다. */
	private static String 이어붙이기(String 클래스_경로, String 메서드_경로) {
		String 합 = (클래스_경로 + "/" + 메서드_경로).replaceAll("/+", "/");
		return 합.length() > 1 && 합.endsWith("/") ? 합.substring(0, 합.length() - 1) : 합;
	}
}
