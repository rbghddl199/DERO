package com.brunchies.dero.placement.judgment;

/**
 * 판정 ③의 입력 — 상판 위 점유 사각형(mm). 소품 쪽과 책상 상판 쪽이 같은 모양이라 하나로 쓴다.
 *
 * <p><b>메쉬 치수가 아니라 규격 메타데이터다</b>(D7/D8, NFR-01) — 3D 바운딩 박스를 여기 넣지 마라.
 *
 * @param widthMm 폭. 비양수는 미등록
 * @param depthMm 깊이. 비양수는 미등록
 */
public record FootprintSpec(int widthMm, int depthMm) {
}
