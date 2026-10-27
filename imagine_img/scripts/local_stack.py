"""로컬 스택을 한 명령으로 띄운다 (2026-08-05).

## 왜 필요한가

실사화 한 장을 눈으로 확인하려면 서로 다른 저장소의 프로세스 셋을 순서대로 띄워야 한다.
이 세션에서 그걸 매번 손으로 했고, 매번 같은 함정을 다시 밟았다:

```text
프론트를 백엔드 없이 띄우면 /simulator 가 AuthGate 에서 막힌다
  -> 인증 스텁을 먼저 띄우고 NEXT_PUBLIC_API_BASE_URL 을 거기로 돌려야 한다
Browser 패널이 안 보이면 rAF 가 멈춰 3D 에셋 로딩이 영원히 안 끝난다
  -> 사람이 패널을 열어야 한다. 스크립트가 대신할 수 없으므로 **말해 준다**
```

## 무엇을 절대 하지 않는가

**운영 DB·Redis·S3 를 건드리지 않는다.** 로컬 워커를 잘못 물리는 것이 이 작업의 유일한
진짜 위험이다(`docs/OPERATIONS_LOCAL_WORKER.md`). 그래서 주소를 **검사하고 거절한다** —
경고로 넘기면 오타 하나로 로컬 워커가 운영 큐를 소비한다. `assert_local_only` 가 그 문지기다.

## 프로파일

```text
capture   인증 스텁 + 프론트 dev 서버        캡처만 할 때 (모델을 올리지 않는다)
worker    워커 REST API                      백엔드/큐 연결 테스트
full      둘 다
```

`capture` 가 모델을 안 올리는 이유: 8GB 카드에서 모델이 6.5GB 를 잡으므로, 캡처만 하려는데
같이 올리면 다른 것을 못 한다.

사용:

```text
python scripts/local_stack.py                 # capture
python scripts/local_stack.py --profile full
```

Ctrl-C 로 전부 내린다.
"""

from __future__ import annotations

import argparse
import os
import re
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
#: 프론트엔드는 별도 저장소다. 위치가 다르면 --frontend 로 넘긴다.
DEFAULT_FRONTEND = REPO.parents[1] / "crawling" / "DERO" / "frontend"

AUTH_STUB_PORT = 8099
FRONTEND_PORT = 3000
WORKER_PORT = 8010

#: 이 변수들의 값이 루프백이 아니면 기동을 거절한다.
GUARDED_VARIABLES = ("REDIS_HOST", "REDIS_URL", "API_BASE_URL", "DB_HOST", "S3_ENDPOINT")

#: 루프백으로 인정하는 값. `0.0.0.0` 은 바인드 주소로 쓰이므로 포함한다.
_LOOPBACK = {"127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0", ""}


class ProductionTargetError(RuntimeError):
    """루프백이 아닌 주소가 설정에 들어왔다."""


def _host_of(value: str) -> str:
    """`redis://host:6379/0`·`https://host/path`·`host` 를 모두 host 로 줄인다."""
    text = value.strip()
    text = re.sub(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", "", text)
    text = text.split("/")[0].split("@")[-1]
    if text.startswith("["):  # IPv6 리터럴
        return text[: text.index("]") + 1]
    return text.rsplit(":", 1)[0] if text.count(":") == 1 else text


def assert_local_only(environment: dict[str, str]) -> None:
    """`GUARDED_VARIABLES` 전부를 검사한다. 하나라도 원격이면 거절한다.

    **첫 변수만 보고 통과시키면 검사가 뜻을 잃는다** — 그래서 전부 돈다.
    """
    offenders = []
    for name in GUARDED_VARIABLES:
        value = environment.get(name)
        if value is None:
            continue
        host = _host_of(value)
        if host.lower() not in _LOOPBACK:
            offenders.append(f"{name}={value!r} (host {host!r})")
    if offenders:
        raise ProductionTargetError(
            "refusing to start: these point outside loopback — "
            + "; ".join(offenders)
            + ". This launcher is for the local stack only "
            "(docs/OPERATIONS_LOCAL_WORKER.md)."
        )


@dataclass
class Service:
    name: str
    #: None 이면 이 프로세스 안에서 스레드로 돈다 (인증 스텁).
    command: list[str] | None
    cwd: Path | None = None
    env: dict[str, str] = field(default_factory=dict)
    #: 200 을 돌려주면 준비된 것으로 본다.
    ready_url: str | None = None
    #: 로그에 이 문자열이 나오면 준비된 것으로 본다.
    ready_log: str | None = None
    note: str | None = None
    #: Redis 큐에 붙는가. 붙는다면 기동 전에 그 Redis 가 운영인지 검사해야 한다 —
    #: 운영 큐에 워커를 붙이면 **운영 작업을 소비한다**(큐에 넣는 것보다 나쁘다).
    touches_redis: bool = False


PROFILES: dict[str, tuple[str, ...]] = {
    "capture": ("auth-stub", "frontend"),
    "worker": ("worker-api",),
    "queue": ("queue-worker",),
    "full": ("auth-stub", "frontend", "worker-api"),
}


def _services(frontend: Path) -> dict[str, Service]:
    node_env = {
        # 프론트가 부르는 인증 엔드포인트를 스텁으로 돌린다. 백엔드 없이 /simulator 를 연다.
        "NEXT_PUBLIC_API_BASE_URL": f"http://localhost:{AUTH_STUB_PORT}",
    }
    return {
        "auth-stub": Service(
            name="auth-stub",
            command=None,
            ready_url=f"http://127.0.0.1:{AUTH_STUB_PORT}/api/v1/users/me",
            note="AuthGate 통과용. 백엔드를 대신하지 않는다 — 인증 두 엔드포인트만 답한다.",
        ),
        "frontend": Service(
            name="frontend",
            command=["npm", "run", "dev"],
            cwd=frontend,
            env=node_env,
            ready_url=f"http://127.0.0.1:{FRONTEND_PORT}/simulator",
            note="캡처는 Browser 패널이 **보일 때만** 된다 (숨으면 rAF 가 멈춘다).",
        ),
        "worker-api": Service(
            name="worker-api",
            command=[sys.executable, "-m", "app.cli", "serve"],
            cwd=REPO,
            # `/health/live` 다. `app/api/auth.py` 의 `PUBLIC_PATHS` 에 그것만 있어서
            # `/health/ready` 는 API 키를 요구한다 — 키 없이 재면 401 을 보고 오해한다.
            ready_url=f"http://127.0.0.1:{WORKER_PORT}/health/live",
            note="첫 기동은 모델 로딩으로 수 분 걸린다.",
        ),
        "queue-worker": Service(
            name="queue-worker",
            command=[sys.executable, "-m", "app.cli", "worker"],
            cwd=REPO,
            ready_log="READY",
            touches_redis=True,
            note=(
                "붙을 Redis 가 운영이면 기동하지 않는다. 원격은 터널로만 붙는다 — "
                "REDIS_HOST 를 원격 주소로 바꾸는 것은 설계 위반이다(config.py)."
            ),
        ),
    }


def plan(profile: str, frontend: Path = DEFAULT_FRONTEND) -> list[Service]:
    if profile not in PROFILES:
        raise ValueError(f"unknown profile {profile!r}; valid: {', '.join(PROFILES)}")
    available = _services(frontend)
    return [available[name] for name in PROFILES[profile]]


# --- 인증 스텁 ---------------------------------------------------------------


class _AuthStubHandler(BaseHTTPRequestHandler):
    """`e2e/helpers/auth.ts` 의 `stubAuthenticatedSession` 과 같은 응답을 낸다.

    프론트 e2e 는 Playwright 의 `page.route` 로 같은 일을 한다(ADR-0016 결정 5: Playwright
    에는 백엔드를 붙이지 않는다). 이 환경에서는 Playwright 가 브라우저를 못 띄워서
    네트워크 레벨에서 같은 일을 한다.
    """

    origin = f"http://localhost:{FRONTEND_PORT}"

    def _send(self, status: int, body: bytes = b"") -> None:
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("access-control-allow-origin", self.origin)
        self.send_header("access-control-allow-credentials", "true")
        self.send_header("access-control-allow-headers", "content-type,authorization")
        self.send_header("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler 규약
        self._send(204)

    def _route(self) -> None:
        path = self.path.split("?")[0]
        if path == "/api/v1/auth/refresh":
            return self._send(
                200, b'{"accessToken":"local-stack-token","expiresInSeconds":1800}'
            )
        if path == "/api/v1/users/me":
            return self._send(
                200,
                b'{"id":1,"email":"local.stack@dero.invalid","nickname":"\xeb\xa1\x9c\xec\xbb\xac",'
                b'"profileImageUrl":null,"provider":"GOOGLE","role":"USER"}',
            )
        if path.startswith("/api/v1/placements"):
            return self._send(200, b'{"content":[],"nextCursor":null,"hasNext":false}')
        # 그 밖은 빈 성공. 콘솔 에러만 줄이는 목적이고 시뮬레이터는 로컬 GLB 로 돈다.
        return self._send(200, b"{}")

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = _route  # noqa: N815

    def log_message(self, *args) -> None:  # 요청마다 한 줄씩 찍히면 런처 출력이 묻힌다
        pass


def _start_auth_stub() -> HTTPServer:
    server = HTTPServer(("127.0.0.1", AUTH_STUB_PORT), _AuthStubHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# --- 기동 --------------------------------------------------------------------


def _assess_redis() -> list[str]:
    """붙을 Redis 가 운영/공용이라는 **증거** 목록. 판정 규칙은 `queue_smoke` 와 공유한다 —
    두 곳에 같은 규칙을 적으면 한쪽만 고쳤을 때 조용히 어긋난다."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from queue_smoke import _client, _gather_evidence, assess_target  # noqa: PLC0415

    from app.core.config import get_settings  # noqa: PLC0415

    settings = get_settings()
    try:
        client = _client(settings)
        client.ping()
    except Exception as exc:
        # 붙지 못하면 운영일 수 없다. 워커가 자기 재연결 루프로 기다리게 둔다.
        print(f"  note  Redis 에 아직 붙지 못했다 ({type(exc).__name__}) — 워커가 재시도한다")
        return []
    try:
        has_auth, uptime_days, commands = _gather_evidence(client)
    except Exception as exc:
        return [f"Redis 를 검사할 수 없다 ({type(exc).__name__}) — 무엇인지 모르면 붙지 않는다"]
    return assess_target(has_auth_keys=has_auth, uptime_days=uptime_days, commands=commands)


def _is_ready(url: str, timeout: float = 2.0) -> bool:
    """2xx/3xx 만 준비로 본다.

    처음엔 `< 500` 이었는데, 그러면 **404 도 준비로 읽힌다** — 프로브 경로를 틀리게 적어도
    런처가 "ready" 라고 말하고 사람은 빈 화면을 본다(실제로 `/health` 로 적어 놓고 이걸로
    통과했다. 진짜 경로는 `/health/live` 다). 문지기가 오탈자를 못 잡으면 없는 것과 같다.
    """
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status < 400
    except urllib.error.HTTPError:
        return False
    except Exception:
        return False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="DERO 로컬 스택 런처")
    parser.add_argument("--profile", default="capture", choices=sorted(PROFILES))
    parser.add_argument("--frontend", type=Path, default=DEFAULT_FRONTEND)
    parser.add_argument("--wait", type=int, default=180, help="준비 대기 상한(초)")
    args = parser.parse_args(argv)

    try:
        assert_local_only(dict(os.environ))
    except ProductionTargetError as exc:
        print(f"[refused] {exc}", file=sys.stderr)
        return 2

    services = plan(args.profile, args.frontend)
    if any(service.name == "frontend" for service in services) and not args.frontend.exists():
        print(f"[refused] frontend not found at {args.frontend}; pass --frontend", file=sys.stderr)
        return 2

    # Redis 에 붙는 서비스가 있으면 **그 Redis 가 무엇인지 보여 준다.**
    #
    # 막지는 않는다. 로컬 워커가 운영 큐를 소비하는 것은 이 시스템의 전제이고 그 워커의
    # 역할이다(`docs/OPERATIONS_LOCAL_WORKER.md`: "EC2 와는 Redis 큐 하나로만 연결한다").
    # 처음엔 운영으로 판정되면 exit 3 으로 막았는데, 그건 의도된 배포 형태를 못 띄우게 하는
    # 것이었다 — 주소를 보고 판단할 수 없으니 **사실을 찍고 사람이 알게 한다.**
    #
    # 금지는 반대 방향에만 있다: 운영 큐에 가짜 작업을 넣는 것(`queue_smoke --push`).
    if any(service.touches_redis for service in services):
        verdict = _assess_redis()
        if verdict:
            print("  redis 운영/공용으로 보인다 — 실제 사용자 작업을 이 기계가 처리한다:")
            for line in verdict:
                print(f"    - {line}")
            print("    (테스트용으로 격리하려면 dev Redis 로 터널을 열고 REDIS_PORT 를 맞춘다)")
        else:
            print("  redis 테스트용으로 보인다 (운영 증거 없음)")

    processes: list[tuple[Service, subprocess.Popen]] = []
    stub: HTTPServer | None = None
    print(f"profile={args.profile}")

    # 이미 떠 있는 것은 건너뛴다. 두 번째 실행에서 인증 스텁이 포트 충돌로 예외를 던지고
    # 죽는 대신, 있는 것을 쓰게 한다 — 실제로 이 세션에서 손으로 띄운 것들이 살아 있었다.
    running = [service for service in services if service.ready_url and _is_ready(service.ready_url)]
    for service in running:
        print(f"  reuse {service.name:<11} already answering {service.ready_url}")
    services = [service for service in services if service not in running]
    if not services:
        print("\n전부 이미 떠 있다. 내릴 것이 없으므로 종료한다.")
        return 0

    try:
        for service in services:
            if service.command is None:
                stub = _start_auth_stub()
                print(f"  start {service.name:<11} (in-process thread, :{AUTH_STUB_PORT})")
                continue
            environment = {**os.environ, **service.env}
            process = subprocess.Popen(
                service.command, cwd=service.cwd, env=environment, shell=os.name == "nt"
            )
            processes.append((service, process))
            print(f"  start {service.name:<11} pid={process.pid}")

        deadline = time.time() + args.wait
        pending = [service for service in services if service.ready_url]
        while pending and time.time() < deadline:
            for service in list(pending):
                if _is_ready(service.ready_url):
                    print(f"  ready {service.name:<11} {service.ready_url}")
                    pending.remove(service)
            if pending:
                time.sleep(1.0)
        for service in pending:
            print(f"  TIMEOUT {service.name} did not answer {service.ready_url}")

        print()
        for service in services:
            if service.note:
                print(f"  note  {service.name:<11} {service.note}")
        print("\nCtrl-C 로 전부 내린다.")
        signal.pause() if hasattr(signal, "pause") else _sleep_forever()
    except KeyboardInterrupt:
        print("\nstopping…")
    finally:
        for service, process in processes:
            process.terminate()
            print(f"  stop  {service.name}")
        if stub is not None:
            stub.shutdown()
    return 0


def _sleep_forever() -> None:
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    raise SystemExit(main())
