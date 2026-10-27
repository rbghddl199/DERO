package com.brunchies.dero.global.response;

import java.util.List;

/**
 * 사용자 대면 목록(무한 스크롤) 응답 봉투. ADR-0008 결정 5.
 *
 * <p>{@code nextCursor}는 <b>불투명 base64 문자열</b>이다 — 프론트는 열어보지 않고 그대로 되돌려준다.
 * 끝이면 {@code nextCursor}는 {@code null}, {@code hasNext}는 {@code false}.
 *
 * <p><b>{@code totalCount}는 원래 결정에 없었다</b>(ADR-0008 결정 5 "총 개수 필드를 두지 않는다" —
 * 커서는 구조상 총 개수를 모르고, 무한 스크롤 UI에 쓸 자리가 없다고 확인했었다). 2026-07-29 실사용
 * 요청으로 추가한다 — 그 문서가 "필요해지면 필드를 더한다, 더하는 건 안 깨진다"고 이미 적어 둔 경로다.
 * <b>대가: 이 필드를 채우는 목록 API는 매 호출마다 {@code COUNT(*)} 쿼리가 하나 더 나간다</b> — 커서
 * 페이지네이션이 원래 피하려던 비용이 하나 다시 들어온 것이다.
 */
public record CursorPage<T>(List<T> content, String nextCursor, boolean hasNext, long totalCount) {
}