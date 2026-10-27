#!/usr/bin/env bash
# 로고 조달: iconify logos: (풀컬러). 없으면 devicon/simple-icons 대체.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)/logos"
mkdir -p "$DIR"
get(){ curl -s --max-time 10 -o "$DIR/$1.svg" "https://api.iconify.design/$2.svg"; echo "$1 <- $2"; }
get airflow      logos/airflow-icon
get crawler      mingcute/rss-2-fill
get kafka        devicon/apachekafka
get flink        simple-icons/apacheflink
get postgres     logos/postgresql
get qdrant       logos/qdrant
get es           logos/elasticsearch
get django       logos/django-icon
get user         mingcute/user-4-fill
get prometheus   logos/prometheus
get grafana      logos/grafana
get spark        logos/apache-spark
get hadoop       logos/hadoop
get redis        logos/redis
get nginx        logos/nginx
get docker       logos/docker-icon
get kubernetes   logos/kubernetes
get vue          logos/vue
get kibana       logos/kibana
get logstash     logos/logstash
