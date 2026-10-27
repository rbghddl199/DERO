package com.brunchies.dero.global.config;

import com.querydsl.jpa.impl.JPAQueryFactory;
import jakarta.persistence.EntityManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * QueryDSL 배선(ADR-0018 결정 2). 동적 조건 조합·타입 안전이 필요한 조회는 이 팩터리를 리포지토리
 * 커스텀 구현에 주입받아 쓴다 — GOOD/BAD 예제는 {@code .claude/rules/java/query-conventions.md}.
 *
 * <p><b>아티팩트 group이 {@code com.querydsl}이 아니라 {@code io.github.openfeign.querydsl}이다</b>
 * (build.gradle). 원본 5.1.0은 JPA 3.1 / Hibernate 6 시절이라 우리 스택(JPA 3.2 · Hibernate 7.4)과
 * 어긋난다. 패키지명은 포크도 {@code com.querydsl.*} 그대로라 import는 바뀌지 않는다.
 *
 * <p>주입받는 {@link EntityManager}는 진짜 EM이 아니라 <b>스레드에 묶인 공유 프록시</b>다 — 그래서 이
 * 싱글턴 빈을 여러 요청이 같이 써도 각자의 트랜잭션 영속성 컨텍스트를 탄다. 컨테이너를 거치지 않고
 * {@code entityManagerFactory.createEntityManager()}로 만들어 넣으면 그 위임이 끊겨 조회가 트랜잭션
 * 밖에서 돈다.
 */
@Configuration
public class QuerydslConfig {

	@Bean
	public JPAQueryFactory jpaQueryFactory(EntityManager entityManager) {
		return new JPAQueryFactory(entityManager);
	}
}
