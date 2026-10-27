package com.brunchies.dero.user;

/**
 * 사용자가 바뀌었다 — 가입·닉네임 변경·탈퇴가 커밋된 뒤 닉네임 인덱스를 맞추라는 신호
 * (ADR-0027 결정 2·3).
 *
 * <p><b>무엇이 바뀌었는지는 싣지 않는다</b>({@code ProductChangedEvent}와 같은 이유) — 받는 쪽이
 * 커밋된 상태를 다시 읽어 "살아 있으면 색인, 없으면 제거"로 판정한다.
 *
 * <p>프로필 이미지 등록은 발행하지 않는다 — 색인에 실리는 값은 <b>닉네임 하나뿐</b>이라
 * (이메일·자기소개는 부결, ADR-0027 결정 3) 다른 필드가 바뀌어도 인덱스는 그대로다.
 */
public record UserChangedEvent(Long userId) {
}
