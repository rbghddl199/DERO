package com.brunchies.dero.global.response;

import java.util.List;
import org.springframework.data.domain.Page;

/**
 * 관리자 화면 목록 응답 봉투. ADR-0008 결정 5.
 *
 * <p>Spring {@link Page}를 그대로 직렬화하지 않고 여기로 옮겨 담는다 — {@code PageImpl}의 JSON 모양은
 * 안정된 공개 계약이 아니고, {@code pageable}·{@code sort}·{@code empty} 같은 안 쓰는 필드가 딸려 나온다.
 */
public record OffsetPage<T>(List<T> content, PageInfo page) {

	public record PageInfo(int number, int size, long totalElements, int totalPages) {
	}

	public static <T> OffsetPage<T> from(Page<T> page) {
		return new OffsetPage<>(
				page.getContent(),
				new PageInfo(
						page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages()));
	}
}
