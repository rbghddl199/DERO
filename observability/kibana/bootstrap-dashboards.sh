#!/usr/bin/env bash
# Kibana 저장 객체를 만든다 — 대시보드 2장:
#   앱 로그 개요   데이터 뷰 app-logs-*     + 저장된 검색 2개 + Lens 2개 (386)
#   검색어 이벤트  데이터 뷰 search-events-* + Lens 2개 (387 — 0건 검색어 · 인기 검색어)
#
# 왜 스크립트인가: Kibana 저장 객체는 ES 인덱스와 별개 저장소(.kibana)에 산다. 인덱스를 아무리
# 잘 만들어도 대시보드는 **사람이 만들기 전까지 0장**이고, 화면은 그냥 빈 목록으로 보인다
# (2026-08-06 실측 — "대시보드에 아무것도 안 나온다"의 원인이 이것이었다).
#
# EC2에서든 SSH 터널 건 로컬에서든 돌아간다. **전부 overwrite라 몇 번 돌려도 같다**(멱등).
#
#   ./observability/kibana/bootstrap-dashboards.sh
#   KB=http://localhost:5601 ./observability/kibana/bootstrap-dashboards.sh
#
# bootstrap-log-indices.sh보다 **나중에**, 그리고 로그가 최소 한 건 들어온 뒤에 돌린다 —
# 데이터 뷰는 만들 때 매핑을 읽어 필드 목록을 굳히므로, 인덱스가 비어 있으면 필드가 없는
# 데이터 뷰가 만들어진다(패널이 "field not found"로 뜬다). 그때는 이 스크립트를 다시 돌리면 된다.

set -euo pipefail

KB="${KB:-http://localhost:5601}"
DV_ID='dero-app-logs'

# ⚠ 아래 JSON 본문은 전부 **따옴표 친 heredoc**(<<'JSON')이다. 따옴표를 빼면 bash가
# `\\\"`를 `\"`로 접어 버려 searchSourceJSON의 중첩 이스케이프가 깨지고 Kibana가
# `Invalid request payload JSON format`으로 400을 낸다(2026-08-06 실측). 그래서 값을 셸
# 변수로 끼워 넣지 않고 리터럴로 박는다 — 특히 아래 GlobalExceptionHandler FQCN.

api() { # api <METHOD> <PATH> ; 본문은 stdin
	local method="$1" path="$2" code
	code=$(curl -sS -o /tmp/kb-bootstrap-out -w '%{http_code}' \
		-X "${method}" "${KB}${path}" \
		-H 'kbn-xsrf: true' -H 'Content-Type: application/json' -d @-)
	if [[ "${code}" != 2* ]]; then
		echo "FAIL ${code} ${method} ${path}" >&2
		head -c 800 /tmp/kb-bootstrap-out >&2
		echo >&2
		return 1
	fi
	echo "ok  ${method} ${path}"
}

so() { # so <type> <id> ; 본문(attributes/references)은 stdin
	api POST "/api/saved_objects/$1/$2?overwrite=true"
}

echo "→ ${KB}"

# --- 데이터 뷰 -----------------------------------------------------------------
# id를 고정한다. 자동 생성 UUID로 두면 다시 돌릴 때마다 새 데이터 뷰가 생기고
# 패널 참조가 옛 id를 가리켜 통째로 깨진다.
api POST /api/data_views/data_view <<JSON
{
  "override": true,
  "data_view": {
    "id": "${DV_ID}",
    "title": "app-logs-*",
    "name": "app-logs",
    "timeFieldName": "@timestamp"
  }
}
JSON

# --- 저장된 검색: ERROR 목록 ----------------------------------------------------
so search dero-search-errors <<'JSON'
{
  "attributes": {
    "title": "ERROR 로그",
    "description": "레벨이 ERROR인 모든 로그. 스택 트레이스는 행을 펼치면 error.stack_trace에 있다.",
    "columns": ["log.logger", "message", "error.type"],
    "sort": [["@timestamp", "desc"]],
    "grid": {},
    "hideChart": false,
    "isTextBasedQuery": false,
    "kibanaSavedObjectMeta": {
      "searchSourceJSON": "{\"query\":{\"query\":\"log.level: ERROR\",\"language\":\"kuery\"},\"filter\":[],\"indexRefName\":\"kibanaSavedObjectMeta.searchSourceJSON.index\"}"
    }
  },
  "references": [
    { "type": "index-pattern", "id": "dero-app-logs", "name": "kibanaSavedObjectMeta.searchSourceJSON.index" }
  ]
}
JSON

# --- 저장된 검색: 500 + 스택 트레이스 --------------------------------------------
# error.stack_trace를 컬럼으로 세워 둔다 — 목록에서 바로 원인 프레임이 보이는 게 목적이다
# (application-prod.yaml의 stacktrace.root=first 덕에 잘려도 원인 예외가 맨 위에 온다).
so search dero-search-500 <<'JSON'
{
  "attributes": {
    "title": "500 예외 · 스택 트레이스",
    "description": "GlobalExceptionHandler가 남긴 서버 오류 전부 — 미처리 예외(500)와 5xx ErrorCode를 든 BusinessException(503 검색 불가 등) 둘 다. 4xx는 여기 안 들어온다(의도).",
    "columns": ["message", "error.type", "error.stack_trace"],
    "sort": [["@timestamp", "desc"]],
    "grid": {},
    "hideChart": false,
    "isTextBasedQuery": false,
    "kibanaSavedObjectMeta": {
      "searchSourceJSON": "{\"query\":{\"query\":\"log.logger: \\\"com.brunchies.dero.global.exception.GlobalExceptionHandler\\\" and log.level: ERROR\",\"language\":\"kuery\"},\"filter\":[],\"indexRefName\":\"kibanaSavedObjectMeta.searchSourceJSON.index\"}"
    }
  },
  "references": [
    { "type": "index-pattern", "id": "dero-app-logs", "name": "kibanaSavedObjectMeta.searchSourceJSON.index" }
  ]
}
JSON

# --- Lens: 시간대별 로그 건수(레벨 누적) ------------------------------------------
so lens dero-lens-volume <<'JSON'
{
  "attributes": {
    "title": "시간대별 로그 건수",
    "visualizationType": "lnsXY",
    "state": {
      "visualization": {
        "legend": { "isVisible": true, "position": "right" },
        "valueLabels": "hide",
        "preferredSeriesType": "bar_stacked",
        "layers": [{
          "layerId": "l1",
          "layerType": "data",
          "seriesType": "bar_stacked",
          "xAccessor": "c_time",
          "splitAccessor": "c_level",
          "accessors": ["c_count"],
          "position": "top",
          "showGridlines": false
        }]
      },
      "query": { "query": "", "language": "kuery" },
      "filters": [],
      "datasourceStates": {
        "formBased": {
          "layers": {
            "l1": {
              "columns": {
                "c_time": {
                  "label": "@timestamp", "dataType": "date", "operationType": "date_histogram",
                  "sourceField": "@timestamp", "isBucketed": true, "scale": "interval",
                  "params": { "interval": "auto", "includeEmptyRows": true, "dropPartials": false }
                },
                "c_level": {
                  "label": "레벨", "dataType": "string", "operationType": "terms",
                  "sourceField": "log.level", "isBucketed": true, "scale": "ordinal",
                  "params": {
                    "size": 5,
                    "orderBy": { "type": "column", "columnId": "c_count" },
                    "orderDirection": "desc", "otherBucket": true, "missingBucket": false,
                    "parentFormat": { "id": "terms" }
                  }
                },
                "c_count": {
                  "label": "건수", "dataType": "number", "operationType": "count",
                  "sourceField": "___records___", "isBucketed": false, "scale": "ratio",
                  "params": { "emptyAsNull": true }
                }
              },
              "columnOrder": ["c_level", "c_time", "c_count"],
              "incompleteColumns": {},
              "sampling": 1
            }
          }
        }
      },
      "internalReferences": [],
      "adHocDataViews": {}
    }
  },
  "references": [
    { "type": "index-pattern", "id": "dero-app-logs", "name": "indexpattern-datasource-layer-l1" }
  ]
}
JSON

# --- Lens: 레벨 분포 -------------------------------------------------------------
so lens dero-lens-levels <<'JSON'
{
  "attributes": {
    "title": "레벨 분포",
    "visualizationType": "lnsPie",
    "state": {
      "visualization": {
        "shape": "donut",
        "layers": [{
          "layerId": "l1",
          "layerType": "data",
          "primaryGroups": ["c_level"],
          "metrics": ["c_count"],
          "numberDisplay": "percent",
          "categoryDisplay": "default",
          "legendDisplay": "default",
          "nestedLegend": false
        }]
      },
      "query": { "query": "", "language": "kuery" },
      "filters": [],
      "datasourceStates": {
        "formBased": {
          "layers": {
            "l1": {
              "columns": {
                "c_level": {
                  "label": "레벨", "dataType": "string", "operationType": "terms",
                  "sourceField": "log.level", "isBucketed": true, "scale": "ordinal",
                  "params": {
                    "size": 10,
                    "orderBy": { "type": "column", "columnId": "c_count" },
                    "orderDirection": "desc", "otherBucket": false, "missingBucket": false,
                    "parentFormat": { "id": "terms" }
                  }
                },
                "c_count": {
                  "label": "건수", "dataType": "number", "operationType": "count",
                  "sourceField": "___records___", "isBucketed": false, "scale": "ratio",
                  "params": { "emptyAsNull": true }
                }
              },
              "columnOrder": ["c_level", "c_count"],
              "incompleteColumns": {},
              "sampling": 1
            }
          }
        }
      },
      "internalReferences": [],
      "adHocDataViews": {}
    }
  },
  "references": [
    { "type": "index-pattern", "id": "dero-app-logs", "name": "indexpattern-datasource-layer-l1" }
  ]
}
JSON

# --- 대시보드 -------------------------------------------------------------------
# 패널은 **참조(by-reference)**로 붙인다. 값으로 박아 넣으면 패널 하나 고치려고
# 대시보드 JSON을 통째로 다시 써야 한다.
# 그리드는 48칸이다(24 아님) — 24로 계산하면 패널이 왼쪽 절반에만 몰린다.
so dashboard dero-app-logs-overview <<'JSON'
{
  "attributes": {
    "title": "앱 로그 개요",
    "description": "app-logs-* 데이터 스트림. 인덱스·ILM 상태는 대시보드가 아니라 Stack Management > Index Management에서 본다.",
    "timeRestore": false,
    "optionsJSON": "{\"useMargins\":true,\"syncColors\":false,\"syncCursor\":true,\"syncTooltips\":false,\"hidePanelTitles\":false}",
    "panelsJSON": "[{\"version\":\"9.4.2\",\"type\":\"lens\",\"panelIndex\":\"p1\",\"gridData\":{\"x\":0,\"y\":0,\"w\":32,\"h\":14,\"i\":\"p1\"},\"embeddableConfig\":{\"enhancements\":{}},\"panelRefName\":\"panel_p1\"},{\"version\":\"9.4.2\",\"type\":\"lens\",\"panelIndex\":\"p2\",\"gridData\":{\"x\":32,\"y\":0,\"w\":16,\"h\":14,\"i\":\"p2\"},\"embeddableConfig\":{\"enhancements\":{}},\"panelRefName\":\"panel_p2\"},{\"version\":\"9.4.2\",\"type\":\"search\",\"panelIndex\":\"p3\",\"gridData\":{\"x\":0,\"y\":14,\"w\":48,\"h\":16,\"i\":\"p3\"},\"embeddableConfig\":{\"enhancements\":{}},\"panelRefName\":\"panel_p3\"},{\"version\":\"9.4.2\",\"type\":\"search\",\"panelIndex\":\"p4\",\"gridData\":{\"x\":0,\"y\":30,\"w\":48,\"h\":18,\"i\":\"p4\"},\"embeddableConfig\":{\"enhancements\":{}},\"panelRefName\":\"panel_p4\"}]",
    "kibanaSavedObjectMeta": {
      "searchSourceJSON": "{\"query\":{\"query\":\"\",\"language\":\"kuery\"},\"filter\":[]}"
    }
  },
  "references": [
    { "name": "p1:panel_p1", "type": "lens",   "id": "dero-lens-volume" },
    { "name": "p2:panel_p2", "type": "lens",   "id": "dero-lens-levels" },
    { "name": "p3:panel_p3", "type": "search", "id": "dero-search-errors" },
    { "name": "p4:panel_p4", "type": "search", "id": "dero-search-500" }
  ]
}
JSON

# ==============================================================================
# 검색어 이벤트 (387 · ADR-0020 결정 7)
#
# 값은 둘이고 둘 다 바로 쓴다 — **결과 0건 검색어 = 카탈로그 구멍 목록**,
# **인기 검색어 = completion suggester 가중치 입력**. 그래서 패널도 딱 둘이다.
#
# 필드 이름(`search.query`·`search.result_count`)은 백엔드 `SearchEventLogger`의 상수,
# `bootstrap-log-indices.sh`의 매핑과 **셋이 같은 계약**이다. 하나만 바뀌면 여기서 에러가 나지
# 않고 패널이 그냥 빈다.
# ==============================================================================

# --- 데이터 뷰 -----------------------------------------------------------------
# `allowNoIndex`가 필요하다 — 첫 검색이 일어나기 전에는 search-events-* 인덱스가 아직 없고,
# 그 상태에서는 데이터 뷰 생성이 "No matching indices found"로 실패한다. 부트스트랩은 배포
# 직후에 도는 것이 정상이므로 없는 쪽이 기본값이다.
#
# 매핑을 bootstrap-log-indices.sh가 못 박아 뒀으므로(keyword/long) 인덱스가 비어 있어도
# 필드 목록은 템플릿에서 나온다 — app-logs 데이터 뷰의 "비면 필드가 없다" 함정이 여기는 없다.
api POST /api/data_views/data_view <<JSON
{
  "override": true,
  "data_view": {
    "id": "dero-search-events",
    "title": "search-events-*",
    "name": "search-events",
    "timeFieldName": "@timestamp",
    "allowNoIndex": true
  }
}
JSON

# --- Lens: 인기 검색어 -----------------------------------------------------------
# 표다. 막대로 세우면 검색어가 x축 라벨이 되어 긴 한글 제품명이 잘린다.
so lens dero-lens-top-queries <<'JSON'
{
  "attributes": {
    "title": "인기 검색어",
    "description": "검색 횟수 상위 20개. completion suggester 가중치를 손볼 때 이 목록이 입력이다.",
    "visualizationType": "lnsDatatable",
    "state": {
      "visualization": {
        "layerId": "l1",
        "layerType": "data",
        "columns": [{ "columnId": "c_query" }, { "columnId": "c_count" }]
      },
      "query": { "query": "", "language": "kuery" },
      "filters": [],
      "datasourceStates": {
        "formBased": {
          "layers": {
            "l1": {
              "columns": {
                "c_query": {
                  "label": "검색어", "dataType": "string", "operationType": "terms",
                  "sourceField": "search.query", "isBucketed": true, "scale": "ordinal",
                  "params": {
                    "size": 20,
                    "orderBy": { "type": "column", "columnId": "c_count" },
                    "orderDirection": "desc", "otherBucket": false, "missingBucket": false,
                    "parentFormat": { "id": "terms" }
                  }
                },
                "c_count": {
                  "label": "검색 횟수", "dataType": "number", "operationType": "count",
                  "sourceField": "___records___", "isBucketed": false, "scale": "ratio",
                  "params": { "emptyAsNull": true }
                }
              },
              "columnOrder": ["c_query", "c_count"],
              "incompleteColumns": {},
              "sampling": 1
            }
          }
        }
      },
      "internalReferences": [],
      "adHocDataViews": {}
    }
  },
  "references": [
    { "type": "index-pattern", "id": "dero-search-events", "name": "indexpattern-datasource-layer-l1" }
  ]
}
JSON

# --- Lens: 결과 0건 검색어 --------------------------------------------------------
# 조건을 패널의 query에 건다 — 대시보드 레벨 필터로 걸면 옆 패널(인기 검색어)까지 0건만 보게 된다.
# `search.result_count`가 long으로 매핑돼 있어야 이 조건이 성립한다(bootstrap-log-indices.sh).
so lens dero-lens-zero-hit-queries <<'JSON'
{
  "attributes": {
    "title": "결과 0건 검색어",
    "description": "사용자가 찾았지만 카탈로그에 없던 것들 — 제품 등록 우선순위 목록이다. 숨김·검수 대기로 걸러진 경우도 0건으로 잡힌다(사용자가 본 결과가 0이므로).",
    "visualizationType": "lnsDatatable",
    "state": {
      "visualization": {
        "layerId": "l1",
        "layerType": "data",
        "columns": [{ "columnId": "c_query" }, { "columnId": "c_count" }]
      },
      "query": { "query": "search.result_count: 0", "language": "kuery" },
      "filters": [],
      "datasourceStates": {
        "formBased": {
          "layers": {
            "l1": {
              "columns": {
                "c_query": {
                  "label": "검색어", "dataType": "string", "operationType": "terms",
                  "sourceField": "search.query", "isBucketed": true, "scale": "ordinal",
                  "params": {
                    "size": 50,
                    "orderBy": { "type": "column", "columnId": "c_count" },
                    "orderDirection": "desc", "otherBucket": false, "missingBucket": false,
                    "parentFormat": { "id": "terms" }
                  }
                },
                "c_count": {
                  "label": "검색 횟수", "dataType": "number", "operationType": "count",
                  "sourceField": "___records___", "isBucketed": false, "scale": "ratio",
                  "params": { "emptyAsNull": true }
                }
              },
              "columnOrder": ["c_query", "c_count"],
              "incompleteColumns": {},
              "sampling": 1
            }
          }
        }
      },
      "internalReferences": [],
      "adHocDataViews": {}
    }
  },
  "references": [
    { "type": "index-pattern", "id": "dero-search-events", "name": "indexpattern-datasource-layer-l1" }
  ]
}
JSON

# --- 대시보드 -------------------------------------------------------------------
so dashboard dero-search-events-overview <<'JSON'
{
  "attributes": {
    "title": "검색어 이벤트",
    "description": "search-events-* 데이터 스트림(ILM 1년). 앱 로그와 보존 기간이 달라 스트림이 갈려 있다.",
    "timeRestore": false,
    "optionsJSON": "{\"useMargins\":true,\"syncColors\":false,\"syncCursor\":true,\"syncTooltips\":false,\"hidePanelTitles\":false}",
    "panelsJSON": "[{\"version\":\"9.4.2\",\"type\":\"lens\",\"panelIndex\":\"p1\",\"gridData\":{\"x\":0,\"y\":0,\"w\":24,\"h\":20,\"i\":\"p1\"},\"embeddableConfig\":{\"enhancements\":{}},\"panelRefName\":\"panel_p1\"},{\"version\":\"9.4.2\",\"type\":\"lens\",\"panelIndex\":\"p2\",\"gridData\":{\"x\":24,\"y\":0,\"w\":24,\"h\":20,\"i\":\"p2\"},\"embeddableConfig\":{\"enhancements\":{}},\"panelRefName\":\"panel_p2\"}]",
    "kibanaSavedObjectMeta": {
      "searchSourceJSON": "{\"query\":{\"query\":\"\",\"language\":\"kuery\"},\"filter\":[]}"
    }
  },
  "references": [
    { "name": "p1:panel_p1", "type": "lens", "id": "dero-lens-top-queries" },
    { "name": "p2:panel_p2", "type": "lens", "id": "dero-lens-zero-hit-queries" }
  ]
}
JSON

echo
echo "완료."
echo "  앱 로그      ${KB}/app/dashboards#/view/dero-app-logs-overview"
echo "  검색어 이벤트 ${KB}/app/dashboards#/view/dero-search-events-overview"
echo "  인덱스 관리   ${KB}/app/management/data/index_management/data_streams"
