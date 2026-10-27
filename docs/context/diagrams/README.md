# 다이어그램 — 발표·온보딩용 그림

발표 슬라이드·README·온보딩에 붙일 **그림 산출물**이 사는 곳. 스펙 소스(`.py`)와 렌더 결과
(`.svg`, `.png`)를 같이 둔다 — 손으로 SVG를 고치지 말고 스펙을 고쳐 다시 뽑는다.

**경계 — 여기 있는 그림은 정본이 아니라 정본의 뷰다.**
사실(무엇이 어디에 배선돼 있나)의 정본은 `deployment.md`(앱 계층)와 `observability.md`(관측
스택)이고, 결정(왜 그렇게 정했나)의 정본은 `architecture-map.md`와 `docs/adr/`다. 두 문서와
그림이 어긋나면 **문서가 맞고 그림이 틀린 것**이니 그림을 다시 뽑아라. 그림에만 있는 사실을
만들지 말 것.

---

## system-architecture

한 장에 EC2 단일 호스트의 전체 계층을 담은 그림. 클라이언트 · 엣지 · 애플리케이션 · 데이터 ·
배포(CI/CD) · 관측을 한 화면에 놓는다. `deployment.md` §1과 `observability.md` §1의 ASCII
그림은 각자 자기 계층만 그리는데, 발표에서는 둘을 합친 한 장이 필요해서 만든 것이다.

| 파일 | 용도 |
|---|---|
| `system-architecture.py` | 스펙 소스(정본). 노드·존·연결선의 논리 위치만 적는다 |
| `system-architecture.svg` | 문서 임베드용 벡터 |
| `system-architecture.png` | 슬라이드 첨부용 래스터 (2332×1312, 2배) |

- **비율은 16:9** — PPT 슬라이드에 여백 없이 들어간다. 스펙의 `metrics.ratio`가 강제한다.
- 그림 안의 값은 **2026-08-08 실측** 기준이다. 이후 배선이 바뀌면 사실 정본 두 문서를 먼저
  고치고 그림을 다시 뽑는다.

### 다시 뽑기

`system-diagram` 스킬(개인 하네스, `~/.claude/skills/system-diagram`)이 렌더러다.

```bash
python3 ~/.claude/skills/system-diagram/render.py \
        docs/context/diagrams/system-architecture.py \
        docs/context/diagrams/system-architecture      # → .svg + .html

rsvg-convert -z 2 -b white \
        -o docs/context/diagrams/system-architecture.png \
        docs/context/diagrams/system-architecture.svg   # 슬라이드용 2배 PNG
```

렌더러는 기록 직전 규칙(직각·무그림자·투명 존·진짜 로고·글자 겹침 금지·검정 글자)을
자기검사하고, 위반이면 파일을 쓰지 않고 `ValueError`로 죽는다. `.html`은 뷰어용이라 커밋하지
않는다.
