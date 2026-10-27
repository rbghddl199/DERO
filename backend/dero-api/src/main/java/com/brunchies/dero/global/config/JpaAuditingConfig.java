package com.brunchies.dero.global.config;

import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.auditing.DateTimeProvider;
import org.springframework.data.domain.AuditorAware;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * JPA 감사 활성화. {@code @EnableJpaAuditing}을 {@code DeroApiApplication}에 직접 붙이지 않는다 —
 * 붙이면 슬라이스 테스트(예: {@code @WebMvcTest})가 이 설정을 끌고 온다.
 *
 * <p><b>{@code modifyOnCreate = false}는 필수다.</b> 기본값 {@literal true}면 Spring Data
 * {@code AuditingHandler.markCreated()}가 {@code @CreatedDate}와 {@code @LastModifiedDate}를 함께 찍어
 * INSERT만 해도 {@code updated_at}이 채워진다. 그러면 {@code docs/context/erd.md} 전역 규칙
 * (2026-07-28 개정, DERO-210)·{@code docs/GLOSSARY.md}·{@link
 * com.brunchies.dero.global.entity.BaseEntity} Javadoc이 못 박은 <b>"정션·토글·이력 테이블의
 * {@code updated_at}은 영원히 NULL"</b>이 거짓이 된다({@code follow}·{@code user_consent}·
 * {@code placement_like} 등 9테이블). UPDATE 시각 기록은 그대로 살아 있다 — 끄는 것은 생성 시점의
 * 동시 기록뿐이다.
 */
@Configuration
@EnableJpaAuditing(dateTimeProviderRef = "auditingDateTimeProvider",
		auditorAwareRef = "auditorAware", modifyOnCreate = false)
public class JpaAuditingConfig {

	/**
	 * Spring Data 기본 {@code CurrentDateTimeProvider}는 {@code LocalDateTime.now()}를 준다. 그런데
	 * 감사 필드 변환에 쓰이는 {@code DefaultFormattingConversionService}에
	 * {@code LocalDateTime → OffsetDateTime} 컨버터가 없어(spring-data-commons {@code Jsr310Converters},
	 * spring-context {@code DateTimeConverters} 둘 다) 저장 시점에
	 * {@code IllegalArgumentException: Cannot convert unsupported date type}으로 죽는다.
	 * {@link OffsetDateTime}을 직접 주면 변환 자체가 일어나지 않는다.
	 */
	@Bean
	public DateTimeProvider auditingDateTimeProvider() {
		return () -> Optional.of(OffsetDateTime.now());
	}

	/**
	 * {@code SecurityContext}의 인증이 {@link JwtAuthenticationToken}일 때만 {@code sub} 클레임(=
	 * {@code user.id}, ADR-0005 결정 10)을 꺼낸다. 그 외(비로그인, 그리고 <b>특히</b> 소셜 로그인
	 * 교환 중의 {@code OAuth2AuthenticationToken})는 {@link Optional#empty()}다.
	 *
	 * <p><b>{@code OAuth2AuthenticationToken}을 여기서 절대 신뢰하면 안 된다</b> — 그 타입의
	 * {@code getName()}은 카카오는 {@code user-name-attribute=id}(카카오 자체 회원번호), 구글은
	 * {@code sub}(구글 자체 subject)를 돌려준다. 둘 다 숫자처럼 생겨서 {@code Long.valueOf}가 예외 없이
	 * 성공하지만, 그건 우리 {@code user.id}가 아니다 — 신규 가입 저장이 마침 이 타입이 걸려 있는
	 * {@code OAuth2LoginSuccessHandler} 안에서 일어나므로, 타입 검사를 빼면 회원가입 시점의
	 * {@code created_by}에 조용히 남의 제공자 회원번호가 박힌다.
	 */
	@Bean
	public AuditorAware<Long> auditorAware() {
		return () -> {
			Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
			if (!(authentication instanceof JwtAuthenticationToken jwtAuth) || !jwtAuth.isAuthenticated()) {
				return Optional.empty();
			}
			return Optional.of(Long.valueOf(jwtAuth.getName()));
		};
	}
}
