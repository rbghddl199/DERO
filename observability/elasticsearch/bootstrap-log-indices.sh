#!/usr/bin/env bash
# 로그 데이터 스트림 2종 + ILM + 라우팅 파이프라인을 ES에 만든다(ADR-0020 결정 6).
#
# Filebeat이 아니라 이 스크립트가 만드는 이유: 스트림이 둘이고 **보존 기간이 다르다**
# (앱 로그 30일 / 검색어 이벤트 1년). Filebeat의 setup.ilm은 한 벌만 표현할 수 있다.
#
# EC2에서 사람이 돌린다. **PUT만 쓰므로 몇 번 돌려도 같다**(멱등).
#
#   ./observability/elasticsearch/bootstrap-log-indices.sh
#   ES=http://localhost:9200 ./observability/elasticsearch/bootstrap-log-indices.sh
#
# Filebeat보다 **먼저** 돌려야 한다. 순서가 뒤집히면 ES가 템플릿 없이 스트림을 자동 생성하고,
# 그 스트림에는 ILM이 안 붙는다 — 나중에 정책을 붙여도 이미 만들어진 인덱스는 대상이 아니라서
# 조용히 영원히 쌓인다. 그때는 스트림을 지우고 다시 만들어야 한다.

set -euo pipefail

ES="${ES:-http://localhost:9200}"

put() {
	local path="$1" body="$2"
	local code
	code=$(curl -sS -o /tmp/es-bootstrap-out -w '%{http_code}' \
		-X PUT "${ES}${path}" -H 'Content-Type: application/json' -d "${body}")
	if [[ "${code}" != 2* ]]; then
		echo "FAIL ${code} PUT ${path}" >&2
		cat /tmp/es-bootstrap-out >&2
		echo >&2
		return 1
	fi
	echo "ok  PUT ${path}"
}

echo "→ ${ES}"

# --- ILM: 앱 로그 30일 -------------------------------------------------------
# hot 7일 롤오버 → 30일 삭제. 단일 노드라 warm/cold 티어는 갈 곳이 없다(같은 디스크다).
put /_ilm/policy/app-logs-ilm '{
  "policy": {
    "phases": {
      "hot":    { "actions": { "rollover": { "max_age": "7d", "max_primary_shard_size": "10gb" } } },
      "delete": { "min_age": "30d", "actions": { "delete": {} } }
    }
  }
}'

# --- ILM: 검색어 이벤트 1년 ---------------------------------------------------
# 앱 로그와 섞지 않는 이유는 보존 기간이다 — 분석 데이터는 오래 봐야 값이 난다(ADR-0020 결정 6).
put /_ilm/policy/search-events-ilm '{
  "policy": {
    "phases": {
      "hot":    { "actions": { "rollover": { "max_age": "30d", "max_primary_shard_size": "10gb" } } },
      "delete": { "min_age": "365d", "actions": { "delete": {} } }
    }
  }
}'

# --- 공통 매핑 ---------------------------------------------------------------
# 단일 노드라 replica는 0이다. 1로 두면 배정할 노드가 없어 클러스터가 영원히 yellow다.
put /_component_template/dero-logs-settings '{
  "template": {
    "settings": { "number_of_shards": 1, "number_of_replicas": 0 },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "message":    { "type": "text" },
        "log":  { "properties": {
          "level":  { "type": "keyword" },
          "logger": { "type": "keyword" }
        } },
        "error": { "properties": {
          "type":        { "type": "keyword" },
          "message":     { "type": "text" },
          "stack_trace": { "type": "text" }
        } }
      }
    }
  }
}'

# --- 검색어 이벤트 필드 -------------------------------------------------------
# 이름이 SearchEventLogger의 상수와 갈리면 대시보드가 **에러 없이 그냥 빈다**(387).
#
# 동적 매핑에 맡기지 않는 이유는 둘이다: ①문자열은 기본이 text + .keyword 서브필드라 집계 필드
# 이름이 `search.query.keyword`가 되어 대시보드 정의가 매핑 구현에 묶인다 ②`result_count`가
# text로 잡히면 "0건만" 같은 숫자 조건을 못 건다. keyword/long으로 못 박으면 `search.query`로
# 바로 집계하고, 숫자는 문자열로 와도 ES가 coerce한다.
#
# `search.index`는 무엇을 검색했는지다(`products`·`placements`·`posts` — SearchIndex 열거형).
# **컴포넌트 템플릿은 새 백킹 인덱스에만 적용된다** — 이미 도는 데이터 스트림에 필드를 태우려면
# 이 스크립트를 다시 돌린 뒤 `POST /search-events-default/_rollover`까지 해야 한다.
put /_component_template/dero-search-events-fields '{
  "template": {
    "mappings": {
      "properties": {
        "search": {
          "properties": {
            "index":        { "type": "keyword" },
            "query":        { "type": "keyword", "ignore_above": 256 },
            "result_count": { "type": "long" },
            "user_id":      { "type": "long" }
          }
        }
      }
    }
  }
}'

# --- 인덱스 템플릿 2종 --------------------------------------------------------
put /_index_template/app-logs '{
  "index_patterns": ["app-logs-*"],
  "data_stream": {},
  "priority": 200,
  "composed_of": ["dero-logs-settings"],
  "template": { "settings": { "index.lifecycle.name": "app-logs-ilm" } }
}'

put /_index_template/search-events '{
  "index_patterns": ["search-events-*"],
  "data_stream": {},
  "priority": 200,
  "composed_of": ["dero-logs-settings", "dero-search-events-fields"],
  "template": { "settings": { "index.lifecycle.name": "search-events-ilm" } }
}'

# --- 라우팅 파이프라인 --------------------------------------------------------
# **얇게 유지한다**(ADR-0020 결정 2 함정). 라우팅 하나뿐이고, 두꺼워지면 나중에 Logstash로
# 옮길 때 이사가 아니라 재작성이 된다.
#
# 앱 코드는 그냥 로그를 찍는다 — 가르는 건 여기다. logger 이름이 유일한 신호이므로
# SearchEventLogger의 **패키지·클래스명을 바꾸면 이 줄도 같이 바꿔야 한다**(안 바꾸면 검색어
# 이벤트가 조용히 앱 로그 스트림으로 섞여 들어가고 30일 뒤 지워진다).
put /_ingest/pipeline/dero-log-routing '{
  "description": "logger 이름으로 로그 스트림을 가른다 (ADR-0020 결정 6)",
  "processors": [
    {
      "set": {
        "field": "_index",
        "value": "search-events-default",
        "if": "ctx.log?.logger != null && ctx.log.logger.endsWith(\"search.SearchEventLogger\")"
      }
    }
  ],
  "on_failure": [
    {
      "set": {
        "field": "error.pipeline",
        "value": "{{ _ingest.on_failure_message }}"
      }
    }
  ]
}'

echo
echo "완료. 확인:"
echo "  curl -s ${ES}/_ilm/policy/app-logs-ilm | head -c 200"
echo "  curl -s '${ES}/_data_stream/app-logs-*' | head -c 400"
