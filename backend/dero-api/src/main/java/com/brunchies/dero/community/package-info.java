/**
 * 커뮤니티 도메인. 애그리거트 루트 {@code Comment} · {@code PlacementLike} · {@code ProductLike} ·
 * {@code PlacementBookmark} · {@code PlacementBookmarkGroup} · {@code Post} · {@code PostLike} ·
 * {@code PostComment} — 각자 루트다.
 *
 * <p>{@code PostImage}는 {@code Post} 애그리거트 안이라 리포지토리가 없고(ADR-0011 결정 8),
 * {@code PostHashtag}는 {@code product} 패키지의 {@code ProductHashtag}와 같은 형태의 정션이다.
 */
package com.brunchies.dero.community;
