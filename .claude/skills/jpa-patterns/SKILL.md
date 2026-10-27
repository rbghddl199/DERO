---
name: jpa-patterns
description: JPA 인덱스 설계·N+1 진단·배치 쓰기·커서 페이징·Hikari 풀·2차 캐시 참조. "N+1 잡아줘", "인덱스 뭘 걸까", "쿼리가 느리다", "saveAll이 한 건씩 나간다", "커서 페이징" 같은 요청에 쓴다.
---

# JPA/Hibernate 패턴 — 인덱스 · N+1 진단 · 배치

Vendored from ECC `jpa-patterns` (2026-08-13, ADR-0042). 일반 지식이고, **충돌하면 `.claude/rules/java/*.md`가 이긴다.**

**Dedup (2026-08-13):** 원본의 엔티티 설계·`fetch = LAZY`·트랜잭션·DTO 프로젝션·마이그레이션·`@DataJpaTest` 절은 삭제했다 — `architecture.md` §7·§10·§13·§16, `query-conventions.md`(엔티티+`join fetch` 기본, 프로젝션 3예외), `backend/flyway-migration.md`, `backend/testing-runtime.md`가 정본이고 **원본의 "읽기 경로는 DTO 프로젝션" 조언은 이 리포 규약과 정반대다**(rules 승 — 프로젝션을 쓰려면 `query-conventions.md`의 3예외에 해당해야 한다).

## N+1 진단 순서

1. SQL을 눈으로 본다 — `logging.level.org.hibernate.SQL=DEBUG`, 파라미터까지 보려면 `logging.level.org.hibernate.orm.jdbc.bind=TRACE`.
2. 같은 형태의 select가 행 수만큼 반복되면 N+1이다. 조치는 `join fetch`(단일 연관) — 규약과 예시는 `query-conventions.md`.
3. **컬렉션은 fetch join 대상이 아니다**(카티전 폭발·페이징 무효). 컬렉션은 별도 배치 조회로 id 집합을 한 번에 읽는다. `default_batch_fetch_size`도 같은 축의 수단이다.

## 인덱스 설계

- 흔한 필터 컬럼과 **모든 FK**에 인덱스를 건다. PG에서 FK는 자동 인덱스가 아니다.
- 복합 인덱스는 **등치 컬럼 먼저, 범위 컬럼 나중**: `WHERE status = ? AND created_at > ?` → `(status, created_at)`.
- 부분 인덱스로 소프트 삭제를 걸러낸다: `... WHERE deleted_at IS NULL`.
- 엔티티에 선언할 때: `@Table(indexes = @Index(name = "idx_x_y", columnList = "y"))`. **단 스키마 정본은 `docs/context/erd.md`(동결)이고 실제 DDL은 Flyway다** — 엔티티 애노테이션이 스키마를 앞서 가면 안 된다.

## 배치 쓰기

```
spring.jpa.properties.hibernate.jdbc.batch_size=50
spring.jpa.properties.hibernate.order_inserts=true
spring.jpa.properties.hibernate.order_updates=true
```

- `IDENTITY` 전략은 배치 insert가 무력화된다 — 이 리포는 `SEQUENCE` + `allocationSize`를 쓴다(`backend/CLAUDE.md`).
- `saveAll`은 배치 설정 없이는 그냥 루프다.

## 커서 페이징

`OFFSET`은 깊은 페이지에서 O(n)이다. 정렬 키를 조건에 넣는다: `where id > :lastId order by id`. 정렬 키가 유니크하지 않으면 tie-breaker(`(created_at, id)`)를 함께 넣는다.

## 커넥션 풀 (HikariCP)

```
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.connection-timeout=30000
```

- 풀 크기는 DB `max_connections`와 **컨텍스트/인스턴스 수**로 나눠서 잡는다. 테스트 프로파일 값(4)은 건드리지 않는다 — 근거는 `.claude/rules/backend/spring-config.md`.

## 캐시

- 1차 캐시는 `EntityManager` 범위다 — 트랜잭션 밖으로 엔티티를 들고 다니지 않는다.
- 2차 캐시는 무효화 전략을 증명할 수 있을 때만. 대개 애플리케이션 캐시(`@Cacheable`)가 먼저다 — `springboot-patterns`.
