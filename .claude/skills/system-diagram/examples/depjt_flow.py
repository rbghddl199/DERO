SPEC = {
    "kind": "flow",
    "title": "Q&A 유저 플로우",
    "nodes": {
        "login": {"type": "start", "label": "로그인", "col": 0, "row": 0},
        "ask": {"type": "step", "label": "질문 입력", "col": 0, "row": 1},
        "search": {"type": "step", "label": "의미검색 · 원문 조회", "col": 0, "row": 2},
        "has": {"type": "decision", "label": "근거 있음?", "col": 0, "row": 3},
        "answer": {"type": "end", "label": "인용 답변 제공", "col": 0, "row": 4, "accent": True},
        "none": {"type": "end", "label": "no_evidence", "col": 1, "row": 4},
    },
    "connectors": [
        {"from": "login", "to": "ask"},
        {"from": "ask", "to": "search"},
        {"from": "search", "to": "has"},
        {"from": "has", "to": "answer", "label": "예"},
        {"from": "has", "to": "none", "label": "아니오"},
    ],
}
