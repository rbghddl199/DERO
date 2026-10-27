---
name: postgres-patterns
description: PostgreSQL 인덱스·타입·쿼리 패턴 참조 — 복합/부분/커버링 인덱스, UPSERT, 커서 페이징, SKIP LOCKED 큐, 느린 쿼리·미인덱스 FK·블로트 진단 SQL. "인덱스 봐줘", "쿼리가 느리다", "EXPLAIN 떠보자", "UPSERT 어떻게", "타입 뭐로" 같은 요청에 쓴다.
---

# PostgreSQL 패턴

Vendored from ECC `postgres-patterns` (2026-08-13, ADR-0042). Based on Supabase Agent Skills (credit: Supabase team, MIT License).

**Dedup (2026-08-13):** RLS 정책 절은 삭제했다 — 이 리포는 Supabase가 아니고 RLS를 쓰지 않는다(권한은 애플리케이션 계층). 타입 선택은 참고용이고 **실제 스키마 정본은 동결된 `docs/context/erd.md`, DDL은 Flyway 마이그레이션이다**(rules `backend/flyway-migration.md`). 엔티티 쪽 인덱스·배치·풀은 `jpa-patterns`.

## 인덱스 치트시트

| 쿼리 형태 | 인덱스 | 예 |
|---|---|---|
| `WHERE col = v` / `WHERE col > v` | B-tree(기본) | `CREATE INDEX idx ON t (col)` |
| `WHERE a = x AND b > y` | 복합(등치 먼저) | `CREATE INDEX idx ON t (a, b)` |
| `WHERE jsonb @> '{}'` | GIN | `CREATE INDEX idx ON t USING gin (col)` |
| `WHERE tsv @@ query` | GIN | `CREATE INDEX idx ON t USING gin (col)` |
| 시계열 범위 | BRIN | `CREATE INDEX idx ON t USING brin (col)` |

```sql
-- 커버링: 인덱스만으로 응답(테이블 접근 제거)
CREATE INDEX idx ON users (email) INCLUDE (name, created_at);

-- 부분: 살아 있는 행만 (소프트 삭제 리포에서 기본형)
CREATE INDEX idx ON users (email) WHERE deleted_at IS NULL;
```

- 운영 테이블에 인덱스를 추가할 때는 `CREATE INDEX CONCURRENTLY`(마이그레이션에서는 트랜잭션 밖이어야 한다).

## 타입 선택

| 용도 | 쓸 것 | 피할 것 |
|---|---|---|
| id | `bigint` | `int`, 랜덤 UUID |
| 문자열 | `text` | `varchar(255)` |
| 시각 | `timestamptz` | `timestamp` |
| 금액 | `numeric(10,2)` | `float` |
| 플래그 | `boolean` | `varchar`, `int` |

## 자주 쓰는 쿼리 형태

```sql
-- UPSERT
INSERT INTO settings (user_id, key, value) VALUES (123, 'theme', 'dark')
ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value;

-- 커서 페이징 (OFFSET은 깊은 페이지에서 O(n))
SELECT * FROM products WHERE id > $1 ORDER BY id LIMIT 20;

-- 큐 소비: 같은 행을 두 워커가 잡지 않는다
UPDATE jobs SET status = 'processing'
WHERE id = (SELECT id FROM jobs WHERE status = 'pending'
            ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
RETURNING *;
```

## 진단 SQL

```sql
-- 인덱스 없는 FK
SELECT conrelid::regclass, a.attname
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (SELECT 1 FROM pg_index i
                  WHERE i.indrelid = c.conrelid AND a.attnum = ANY(i.indkey));

-- 느린 쿼리 (pg_stat_statements 확장 필요)
SELECT query, mean_exec_time, calls FROM pg_stat_statements
WHERE mean_exec_time > 100 ORDER BY mean_exec_time DESC;

-- 블로트/베큐엄 지체
SELECT relname, n_dead_tup, last_vacuum FROM pg_stat_user_tables
WHERE n_dead_tup > 1000 ORDER BY n_dead_tup DESC;
```

- 계획을 볼 때는 `EXPLAIN (ANALYZE, BUFFERS)` — 추정만 보는 `EXPLAIN`으로는 오판한다.

## 인스턴스 설정

```sql
ALTER SYSTEM SET statement_timeout = '30s';
ALTER SYSTEM SET idle_in_transaction_session_timeout = '30s';
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT pg_reload_conf();
```

운영 PG는 EC2 compose 컨테이너다 — 실제 배선·접속 절차 정본은 `docs/context/deployment.md`. 리뷰가 필요하면 `database-reviewer` 에이전트.
