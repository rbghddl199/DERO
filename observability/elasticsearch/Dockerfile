# Elasticsearch + analysis-nori. 공식 이미지에는 Nori가 없어서 이 빌드가 필요하다
# (ADR-0019 결정 2 — 한국어 띄어쓰기 불일치를 잡는 것이 형태소 분석기를 쓰는 이유다).
#
# ⚠ Jenkins는 이 이미지를 짓지 않는다. 사람이 EC2에서 손으로 build 한다 —
#   docker compose -f compose.observability.yaml build   (docs/context/observability.md §2)
#
# 태그는 elasticsearch-java 클라이언트 버전과 맞춘다(backend/dero-api/build.gradle의
# spring-boot-starter-elasticsearch 4.1.0 → elasticsearch-java 9.4.2). 서버가 클라이언트보다
# 낮으면 클라이언트가 보내는 API를 서버가 모르는 조합이 생긴다.
FROM docker.elastic.co/elasticsearch/elasticsearch:9.4.2

# --batch는 플러그인이 권한 확인 프롬프트를 띄우지 않게 한다 — 없으면 빌드가 입력을 기다리다 멈춘다.
# 플러그인 버전은 인자로 주지 않는다: 설치기가 실행 중인 ES 버전에 맞는 것만 받는다.
RUN elasticsearch-plugin install --batch analysis-nori
