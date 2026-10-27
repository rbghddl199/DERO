package com.brunchies.dero.community.dto;

/**
 * 좋아요 토글의 현재 상태 — 재접속 후 하트가 채워져 있어야 하므로 서버가 답해야 한다.
 *
 * <p><b>{@code api-spec.md} 표엔 {@code PUT}/{@code DELETE}만 적혀 있다</b>(§4·§5·§6). 같은 단수
 * 하위 리소스({@code .../like})의 <u>읽기</u>라 경로를 새로 파지 않고 {@code GET}을 얹었다. 왕복이
 * 더 적은 길은 배치·제품·게시글 <b>상세 응답에 {@code isLiked}를 싣는 것</b>이지만 그 응답은
 * placement·product 도메인 소유라 이 티켓 범위 밖이다 — 상세에 실리는 날 이 {@code GET}은 지운다.
 *
 * <p>{@code likeCount}의 출처는 대상마다 다르다: 배치·게시글은 집계 캐시 컬럼, 제품은 컬럼이 없어
 * {@code product_like}를 매번 센다.
 */
public record LikeStateResponse(boolean liked, long likeCount) {
}
