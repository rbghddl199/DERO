package com.brunchies.dero.community.repository;

import com.brunchies.dero.community.DeskFeed;
import com.brunchies.dero.community.DeskFeedSort;
import com.brunchies.dero.global.response.CursorCodec;
import java.util.List;
import org.springframework.data.domain.Limit;

/**
 * 데스크피드 목록의 동적 조합({@code ?hashtag}·{@code ?owner}·{@code ?placementId}·{@code ?sort}) —
 * 선택 술어가 셋에 정렬 축이 요청에서 오므로 QueryDSL 프래그먼트다(querydsl-rubric §2·§4,
 * {@code PostRepositoryCustom}과 같은 자리).
 */
public interface DeskFeedRepositoryCustom {

	/**
	 * 커서 목록. {@code cursor}는 {@code (정렬키값, id)} 복합이고 첫 페이지는 {@code null}이다.
	 * 다음 페이지 유무 판단을 위해 호출부가 {@code size + 1}을 요청한다.
	 */
	List<DeskFeed> findPage(String hashtagName, Long ownerId, Long placementId, DeskFeedSort sort,
			CursorCodec.Composite cursor, Limit limit);

	/** 목록과 같은 술어의 총 개수 — 같은 헬퍼를 공유해 한쪽만 빠뜨릴 수 없게 한다. */
	long countPage(String hashtagName, Long ownerId, Long placementId);
}
