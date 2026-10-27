#!/usr/bin/env bash
#
# blue-green 배포 스위치.
#
#   deploy-switch.sh            노는 색을 띄우고 → 헬스 통과하면 → 트래픽을 넘긴다
#   deploy-switch.sh rollback   트래픽만 반대 색으로 되돌린다 (재빌드·재기동 없음)
#   deploy-switch.sh status     현재 색과 양쪽 컨테이너 상태만 찍는다
#
# 스위치 지점은 nginx upstream 심볼릭 링크 하나다. 링크가 가리키는 파일이 곧 현재 색이고,
# 그래서 상태를 어디에도 따로 안 적는다 — 배선 자체가 상태다.
#
# 근거: docs/adr/0026-blue-green-deploy-and-expand-contract-migration.md
# 배선 정본: docs/context/deployment.md
#
# ── 호스트 선행 조건 (사람이 최초 1회) ────────────────────────────────────────
#   sudo mkdir -p /var/lib/dero/nginx && sudo chown jenkins:jenkins /var/lib/dero/nginx
#   /etc/nginx/sites-available/dero 에 infra/nginx/dero.conf 반영 (include + upstream 이름)
#   sudoers 드롭인:
#     jenkins ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /bin/systemctl reload nginx
#
# ⚠ 최초 전환 1회만: 기존 `-p dero` 프로젝트가 3000·8081을 물고 있다. 링크가 없으면 이
#   스크립트는 green(3010/8091)으로 뜨므로 충돌하지 않는다. 스위치가 끝난 뒤 옛 프로젝트를
#   손으로 내려라 — `docker compose -p dero down`. 그 전까지 3000·8081은 옛 컨테이너 것이다.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LINK_DIR=/var/lib/dero/nginx
ACTIVE="$LINK_DIR/active.conf"
# reload 뒤 nginx를 실제로 찔러 보는 데만 쓴다. `--resolve`로 호스트에서 자기 자신을 치므로
# DNS·인터넷 경로를 타지 않는다. 정본은 nginx의 server_name (`infra/nginx/dero.conf`).
PUBLIC_HOST=www.dero.life

# 헬스 폴링 상한. Spring Boot 부팅 + Flyway 검증이라 프론트보다 한참 걸린다.
HEALTH_TRIES=60
HEALTH_INTERVAL=2
# reload 후 옛 색을 멈추기까지 기다리는 시간. nginx는 기존 워커를 graceful하게 끝내므로
# 이 창이 곧 in-flight 요청의 유예다.
DRAIN_SECONDS=10

log() { echo "[deploy-switch] $*"; }
die() { echo "[deploy-switch] ERROR: $*" >&2; exit 1; }

# `*)`를 뺄 수 없다. 매칭 안 되는 case는 **빈 문자열 + exit 0**이라, 호출부가 그대로
# `http://127.0.0.1:/` (= 80포트)를 치고 그럴싸하게 실패한다 — 로그만 봐서는 안 보인다.
frontend_port() { case "$1" in blue) echo 3000 ;; green) echo 3010 ;; *) die "알 수 없는 색: $1" ;; esac; }
backend_port()  { case "$1" in blue) echo 8081 ;; green) echo 8091 ;; *) die "알 수 없는 색: $1" ;; esac; }
other()         { case "$1" in blue) echo green ;; green) echo blue ;; *) die "알 수 없는 색: $1" ;; esac; }

# 링크가 가리키는 파일 이름에서 색을 읽는다. 링크가 없으면 blue로 친다 —
# 그러면 대상이 green이 되어 기존 `-p dero`가 물고 있는 3000·8081과 부딪히지 않는다.
current_color() {
    if [ -L "$ACTIVE" ]; then
        local target
        target="$(basename "$(readlink "$ACTIVE")")"
        case "$target" in
            upstream-blue.conf)  echo blue ;;
            upstream-green.conf) echo green ;;
            *) die "링크가 알 수 없는 파일을 가리킨다: $target" ;;
        esac
    else
        echo blue
    fi
}

# 색을 가리키도록 링크를 바꾸고 nginx를 reload한다. `nginx -t`가 게이트라 설정이 깨지면
# reload가 아예 안 돌고 현재 배선이 그대로 산다.
#
# ⚠ 실패하면 반드시 링크를 되돌린다. 안 되돌리면 nginx 메모리(옛 설정)와 디스크(새 색)가
# 어긋난 채 남고, **나중에 certbot 갱신 훅이 reload하는 순간 아무도 모르게 색이 넘어간다.**
# 그 사이 새 색을 손으로 내려 뒀다면 그 reload가 곧 전면 장애다.
point_nginx_at() {
    local color=$1 prev
    prev="$(readlink "$ACTIVE" 2>/dev/null || true)"

    cp "$REPO_DIR/infra/nginx/upstream-$color.conf" "$LINK_DIR/"
    ln -sfn "$LINK_DIR/upstream-$color.conf" "$ACTIVE"

    if ! sudo /usr/sbin/nginx -t || ! sudo /bin/systemctl reload nginx; then
        if [ -n "$prev" ]; then
            ln -sfn "$prev" "$ACTIVE"
            die "nginx 반영 실패 — 링크를 $prev 로 되돌렸다. 배선 무변경."
        fi
        die "nginx 반영 실패 — 되돌릴 이전 링크가 없다(최초 전환). 링크를 지우고 재시도하라."
    fi

    # reload의 종료 코드는 "HUP을 보냈다"까지만 말한다. 실제로 요청을 받는지는 찔러 봐야 안다.
    # TLS 종료를 포함한 진짜 입구로 친다 — `--resolve`라 DNS를 안 타고, 사설 인증서 검증은
    # 여기서 볼 게 아니라 `-k`로 넘긴다.
    #
    # ⚠ 이건 **nginx가 살아 있다**만 증명한다. 어느 색으로 가는지는 증명하지 못한다 — 겹침
    # 창에는 양쪽 다 건강하고, 색을 구분하려면 앱이 색을 응답에 실어야 하는데 안 싣는다.
    # 색 판정은 스위치 **전에** 해당 색 포트를 직접 친 헬스 게이트가 이미 했다(결정 6).
    # (`nginx -T`로 로드된 설정을 덤프하는 쪽은 부결 — sudoers가 `-t`만 허용하고, 그마저
    #  디스크를 다시 읽는 것이라 nginx 메모리를 증명하지 못한다.)
    if ! curl -fsS -o /dev/null --max-time 5 -k \
        --resolve "$PUBLIC_HOST:443:127.0.0.1" "https://$PUBLIC_HOST/api/actuator/health"; then
        if [ -n "$prev" ]; then
            ln -sfn "$prev" "$ACTIVE"
            sudo /bin/systemctl reload nginx || true
            die "reload 뒤 nginx가 응답하지 않는다 — 링크를 $prev 로 되돌리고 다시 reload했다."
        fi
        die "reload 뒤 nginx가 응답하지 않는다. 되돌릴 이전 링크가 없다(최초 전환) — 손으로 확인하라."
    fi
}

wait_healthy() {
    local url=$1 i
    for i in $(seq 1 "$HEALTH_TRIES"); do
        if curl -fsS --max-time 5 "$url" > /dev/null 2>&1; then
            log "OK  $url ($((i * HEALTH_INTERVAL))초)"
            return 0
        fi
        sleep "$HEALTH_INTERVAL"
    done
    log "타임아웃 $url"
    return 1
}

compose_up() {
    local color=$1
    cd "$REPO_DIR"
    FRONTEND_PORT="$(frontend_port "$color")" \
    BACKEND_PORT="$(backend_port "$color")" \
        docker compose -p "dero-$color" up -d --remove-orphans
}

# stop만 하고 rm은 하지 않는다. 컨테이너가 남아 있어야 `start` 한 번으로 되살아난다
# (ADR-0026 결정 1). 다음 배포가 이 색을 재사용하며 덮는다.
#
# 실패해도 진행은 막지 않는다(최초 전환에는 멈출 프로젝트가 아예 없다). 다만 **삼키지는
# 않는다** — 옛 색이 안 죽은 채 "완료"가 찍히면 다음 배포가 그 색을 대상으로 잡고 포트
# 충돌로 죽는데, 그때 로그에 아무 단서가 없다.
compose_stop() {
    cd "$REPO_DIR"
    docker compose -p "dero-$1" stop \
        || log "WARN: dero-$1 정지 실패 — 아직 떠 있을 수 있다. 'deploy-switch.sh status'로 확인하라."
}

cmd_deploy() {
    local from to fe be
    from="$(current_color)"
    to="$(other "$from")"
    fe="$(frontend_port "$to")"
    be="$(backend_port "$to")"
    log "현재=$from → 대상=$to (frontend :$fe · backend :$be)"

    compose_up "$to"

    # 아직 트래픽이 없는 색을 직접 친다. 여기서 실패하면 사용자는 아무것도 못 느낀다.
    if ! wait_healthy "http://127.0.0.1:$fe/" \
        || ! wait_healthy "http://127.0.0.1:$be/api/actuator/health"; then
        log "헬스 실패 — $to를 내리고 $from을 그대로 둔다"
        (cd "$REPO_DIR" && docker compose -p "dero-$to" logs --no-color --tail=200) || true
        compose_stop "$to"
        die "새 색이 뜨지 않았다. 배선은 안 건드렸다."
    fi

    log "트래픽을 $to로 넘긴다"
    point_nginx_at "$to"

    log "${DRAIN_SECONDS}초 대기 후 $from 정지 (in-flight 유예)"
    sleep "$DRAIN_SECONDS"
    compose_stop "$from"

    log "완료. 현재=$to · 롤백은 'deploy-switch.sh rollback'"
}

# 옛 색 컨테이너가 stop 상태로 남아 있으므로 start + 링크만 되돌리면 끝난다.
cmd_rollback() {
    local from to fe be
    from="$(current_color)"
    to="$(other "$from")"
    fe="$(frontend_port "$to")"
    be="$(backend_port "$to")"
    log "롤백: $from → $to"

    cd "$REPO_DIR"
    # 원인을 단정하지 않는다. start 실패는 "컨테이너가 없다" 말고도 docker 데몬 정지·소켓
    # 권한으로도 난다 — 장애 중에 불필요한 전체 재배포로 몰지 않기 위해 둘 다 적는다.
    docker compose -p "dero-$to" start \
        || die "$to start 실패. docker 상태를 먼저 보고, 컨테이너가 없으면 롤백 창이 지난 것이니 Docker Hub 번호 태그로 재배포하라."

    wait_healthy "http://127.0.0.1:$fe/" || die "$to frontend가 안 뜬다"
    wait_healthy "http://127.0.0.1:$be/api/actuator/health" || die "$to backend가 안 뜬다"

    point_nginx_at "$to"
    log "완료. 현재=$to · $from은 아직 떠 있다(직접 stop하라)"
}

cmd_status() {
    log "현재 색: $(current_color)"
    docker compose -p dero-blue ps 2>/dev/null || true
    docker compose -p dero-green ps 2>/dev/null || true
}

case "${1:-deploy}" in
    deploy)   cmd_deploy ;;
    rollback) cmd_rollback ;;
    status)   cmd_status ;;
    *) die "사용법: $(basename "$0") [deploy|rollback|status]" ;;
esac
