SPEC = {
    "kind": "sequence",
    "title": "Q&A RAG 흐름",
    "actors": [("U", "사용자"), ("D", "Django API"), ("Q", "Qdrant"), ("P", "PostgreSQL"), ("L", "LLM")],
    "messages": [
        ("U", "D", "질문", "call"),
        ("D", "Q", "임베딩 · 의미검색", "call"),
        ("Q", "D", "관련 청크 top-k", "return"),
        ("D", "P", "원문 · 메타 조회", "call"),
        ("P", "D", "기사 본문", "return"),
        ("D", "L", "컨텍스트 + 질문", "call"),
        ("L", "D", "인용 포함 답변", "return"),
        ("D", "U", "근거 인용 답변", "highlight"),
    ],
    "note": ("D", "스코프 가드 · 충실도 검사"),
}
