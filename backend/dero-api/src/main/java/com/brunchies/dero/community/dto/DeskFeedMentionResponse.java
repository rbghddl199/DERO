package com.brunchies.dero.community.dto;

/**
 * 본문·댓글에 박힌 멘션 토큰 하나의 해석 결과(D35·ADR-0038 결정 2).
 *
 * <p><b>해석 책임이 서버에 있는 이유</b>: 토큰에는 userId만 있고 화면에 나가는 것은 <b>현재</b>
 * 닉네임이다. 프론트가 id마다 프로필을 조회하면 멘션 수만큼 왕복이 생기므로, 본문을 이미 들고 있는
 * 서버가 한 번에 풀어 응답에 동봉하고 프론트는 치환만 한다.
 *
 * <p><b>탈퇴·부재 사용자는 이 목록에 아예 없다</b> — {@code nickname}을 {@code null}로 실어 두
 * 갈래를 만드는 대신 빠뜨려서, 화면의 폴백("@알 수 없음", 링크 없음)이 <b>"목록에 없으면"</b> 한
 * 조건으로 성립하게 한다(ADR-0038 결정 4).
 */
public record DeskFeedMentionResponse(Long userId, String nickname) {
}
