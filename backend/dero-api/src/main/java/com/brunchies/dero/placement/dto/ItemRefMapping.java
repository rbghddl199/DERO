package com.brunchies.dero.placement.dto;

/**
 * 저장 응답의 {@code ref → id} 한 줄(ADR-0009 결정 6). 신규 아이템의 서버 id를 <b>재조회 없이</b>
 * 알려 주는 자리다 — 다음 저장에서 그 id가 UPDATE 대상이 된다.
 */
public record ItemRefMapping(String ref, Long id) {
}
