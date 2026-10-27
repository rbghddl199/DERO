package com.brunchies.dero.placement.dto;

import com.brunchies.dero.placement.PublishStatus;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * {@code GET /placements} 목록의 한 줄. <b>상세({@link PlacementDetailResponse})와 달리 책상·아이템을
 * 싣지 않는다</b> — 둘 다 컬렉션이라 목록에서 {@code join fetch}하면 행이 곱해져 커서 페이지네이션이
 * 깨진다(query-conventions §3).
 *
 * <p>{@code thumbnailUrl}은 presigned GET URL이다 — 파일 서빙 엔드포인트를 만들지 않는다
 * ({@code docs/context/api-spec.md} §11). key가 배치마다 결정론적이라 <b>아직 캡처 안 한 배치도 URL은
 * 나가고 그 URL이 404다</b> — 프론트는 truthy 여부가 아니라 로드 실패로 폴백을 판단한다.
 *
 * <p>{@code primaryImageUrl}은 대표 상상도({@code generated_image.is_primary})의 presigned GET
 * URL이고 <b>업로드 전이면 {@code null}이다</b> — 그 배치엔 상상도가 아직 한 장도 없다.
 * <b>데스크 피드 카드의 표지는 이 값이고 {@code thumbnailUrl}(스크린샷)은 내 작업실 카드용이다</b>
 * (ADR-0015 결정 7 표) — 둘을 바꿔 쓰면 피드가 AI 상상도 대신 시뮬레이터 화면을 그린다.
 *
 * <p>{@code ownerId}·{@code ownerNickname}은 <b>둘 다 NULL일 수 있다</b> — {@code placement.user}가
 * {@code ON DELETE SET NULL}이라 작성자가 탈퇴해도 공개 배치는 피드에 남는다.
 *
 * <p>{@code isTemplate}은 운영진 시딩 템플릿 표시다(REQ-ADM-03). <b>노출 여부와는 무관하다</b> —
 * 피드에 걸리는 것은 여전히 {@code publishStatus = PUBLIC} 하나가 정하고, 이 값은 피드 카드의 배지와
 * 관리자 화면의 지정 상태를 그리는 데만 쓴다. 관리자 화면이 토글 후 재조회로 상태를 확인하려면
 * 목록에 실려야 한다(전용 관리자 목록 엔드포인트를 새로 파지 않는다 — 운영진은
 * {@code GET /placements?owner=me}로 자기 배치를 본다).
 *
 * <p>{@code tags}는 공개 전환 때 붙인 해시태그 이름들이다({@code placement_hashtag}, ADR-0027 결정 5)
 * — <b>{@code '#'}은 붙어 있지 않다</b>(표기는 화면의 몫이고 저장 값에 섞으면 같은 태그가 두 행이
 * 된다). 태그가 없으면 빈 배열이고 {@code null}은 오지 않는다. 상세 응답에는 없다 — 데스크 피드 상세도
 * 카드와 같은 이 요약을 {@code ?ids=}로 읽기 때문이다.
 *
 * <p><b>{@code budgetKrw}는 사용자가 정한 예산이고 {@code totalPriceKrw}가 실제 데스크 값이다</b> —
 * 둘을 바꿔 쓰면 화면이 "가격"이라며 예산을 그린다(2026-08-10, DERO-547에서 실제로 그랬다:
 * 위저드 기본 예산 75만원이 모든 카드에 떴다). 합계 규칙은 {@code GET /placements/{id}/estimate}와
 * <b>같은 함수</b>다({@code PlacementEstimateService.totalPriceKrwByIds}) — 인스턴스 단위 합이고
 * 직접 입력 규격 책상은 0이다(D18). 아이템이 없으면 0이지 {@code null}이 아니다.
 *
 * <p><b>{@code isBookmarked}는 호출자별 값이고 비로그인은 항상 {@code false}다.</b> 카드마다
 * {@code GET /placements/{id}/bookmark}를 치면 페이지 크기만큼 왕복이 늘어(N+1) 갤러리가 서버 진실을
 * 못 그리던 자리다 — 페이지의 id 묶음으로 한 번에 조회한다. {@code bookmarkGroupId}는 담긴 그룹이고
 * 그룹 미지정·소프트 삭제된 그룹이면 {@code null}이다.
 */
public record PlacementSummaryResponse(
		Long id,
		String title,
		String description,
		List<String> tags,
		PublishStatus publishStatus,
		boolean isTemplate,
		Integer budgetKrw,
		long totalPriceKrw,
		int likeCount,
		Long ownerId,
		String ownerNickname,
		String thumbnailUrl,
		String primaryImageUrl,
		boolean isBookmarked,
		Long bookmarkGroupId,
		OffsetDateTime createdAt,
		OffsetDateTime updatedAt) {
}
