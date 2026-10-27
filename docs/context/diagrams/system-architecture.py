SPEC = {
    "kind": "architecture",
    "title": "Dero — 시스템 아키텍처 (EC2 단일 호스트)",
    # PPT 슬라이드 비율(16:9) 고정 + 슬라이드용 넓은 격자
    "metrics": {"pitch_x": 240, "pitch_y": 112, "ratio": 16 / 9},
    "nodes": {
        # 배포 · CI/CD (상단 좌측)
        "gitlab": {"logo": "gitlab", "label": "GitLab", "sub": "MR · 웹훅", "col": 0, "row": 0, "group": "ci"},
        "jenkins": {"logo": "jenkins", "label": "Jenkins", "sub": "blue·green", "col": 1, "row": 0, "group": "ci"},
        # 클라이언트 · 엣지
        "user": {"logo": "user", "label": "사용자", "sub": "브라우저", "col": 0, "row": 2, "group": "client"},
        "nginx": {"logo": "nginx", "label": "nginx", "sub": "TLS · 443", "col": 1, "row": 2, "group": "edge"},
        # 애플리케이션
        "nextjs": {"logo": "nextjs", "label": "Next.js 16", "sub": "R3F · 3D 씬", "col": 2, "row": 0, "group": "app"},
        "spring": {"logo": "spring", "label": "Spring Boot 4.1", "sub": "REST API", "col": 2, "row": 2, "group": "app"},
        # 데이터
        "postgres": {"logo": "postgres", "label": "PostgreSQL 18", "sub": "정본 · Flyway", "col": 3, "row": 0, "group": "data"},
        "redis": {"logo": "redis", "label": "Redis 8", "sub": "세션 · 캐시", "col": 3, "row": 1, "group": "data"},
        "es": {"logo": "es", "label": "Elasticsearch", "sub": "Nori · 로그", "col": 3, "row": 2, "group": "data"},
        # 관측 (하단 레인)
        "grafana": {"logo": "grafana", "label": "Grafana", "sub": "대시보드", "col": 1, "row": 4, "group": "observe"},
        "prometheus": {"logo": "prometheus", "label": "Prometheus", "sub": "actuator", "col": 2, "row": 4, "group": "observe"},
        "filebeat": {"logo": "filebeat", "label": "Filebeat", "sub": "docker 로그", "col": 3, "row": 4, "group": "observe"},
        "kibana": {"logo": "kibana", "label": "Kibana", "sub": "SSH 터널만", "col": 4, "row": 4, "group": "observe"},
    },
    "groups": [
        {"id": "ci", "label": "배포 · CI/CD", "emphasis": 1.1, "dashed": True},
        {"id": "client", "label": "클라이언트", "emphasis": 1.6, "dashed": False},
        {"id": "edge", "label": "엣지", "emphasis": 1.6, "dashed": False},
        {"id": "app", "label": "애플리케이션", "emphasis": 2.6, "dashed": False},
        {"id": "data", "label": "데이터", "emphasis": 2.6, "dashed": False},
        {"id": "observe", "label": "관측 · OBSERVE", "emphasis": 1.1, "dashed": True},
    ],
    "connectors": [
        {"from": "user", "to": "nginx"},
        {"from": "nginx", "to": "nextjs"},
        {"from": "nginx", "to": "spring"},
        # 서버 렌더(RSC)만 컨테이너 네트워크로 직행한다 — nginx·TLS를 안 거친다(ADR-0005 결정 12-개정).
        # 열 중앙(x=580)은 jenkins 배포선이 쓰므로 오른쪽으로 비켜 내린다.
        {"from": "nextjs", "to": "spring", "path": "M610 164 V300"},
        # 스프링 → 데이터: 수직 트렁크를 분리해 선끼리 겹치지 않게 한다
        {"from": "spring", "to": "postgres", "path": "M636 344 H700 V120 H764"},
        {"from": "spring", "to": "redis", "path": "M636 344 H730 V232 H764"},
        {"from": "spring", "to": "es"},
        {"from": "filebeat", "to": "es"},
        {"from": "es", "to": "kibana"},
        {"from": "prometheus", "to": "spring"},
        {"from": "prometheus", "to": "grafana"},
        {"from": "gitlab", "to": "jenkins", "dashed": True},
        {"from": "jenkins", "to": "spring", "dashed": True, "path": "M340 164 V254 H580 V300"},
    ],
    "edge_labels": [
        {"on": ("user", "nginx"), "text": "HTTPS"},
        {"on": ("nginx", "nextjs"), "text": "/"},
        {"on": ("nginx", "spring"), "text": "/api/"},
        {"on": ("nextjs", "spring"), "text": "RSC 직행", "xy": (622, 236)},
        {"on": ("spring", "es"), "text": "검색", "xy": (700, 368)},
        {"on": ("prometheus", "spring"), "text": "scrape"},
        {"on": ("es", "kibana"), "text": "로그 조회"},
        {"on": ("gitlab", "jenkins"), "text": "웹훅"},
        {"on": ("jenkins", "spring"), "text": "이미지 배포", "xy": (410, 246)},
    ],
}
