package com.brunchies.dero.auth.service;

import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * 리프레시 토큰 상태(Redis {@code refresh:{userId}} 키, jti Set)를 관리한다(ADR-0005 결정 4·5).
 * 세션·리프레시 테이블이 ERD에 없어(동결) Redis가 유일한 자리다.
 *
 * <p><b>체크-후-조작이 원자적이지 않다</b> — Lua 스크립트나 트랜잭션으로 묶지 않는다. 데스크 시뮬레이터는
 * 사용자당 기기가 사실상 하나라(ADR-0005 "대안과 버린 이유") 동시 회전 경합이 실질적으로 안 생긴다는
 * 전제로, 그 복잡도를 지금 안 산다.
 */
@Service
@RequiredArgsConstructor
public class RefreshTokenService {

	private static final String KEY_PREFIX = "refresh:";
	private static final Duration TTL = Duration.ofDays(14);

	private final StringRedisTemplate redis;

	/** 최초 로그인 시 리프레시 {@code jti}를 등록한다. */
	public void register(Long userId, String jti) {
		String key = key(userId);
		redis.opsForSet().add(key, jti);
		redis.expire(key, TTL);
	}

	/**
	 * 회전(rotate): {@code oldJti}가 유효하면 {@code newJti}로 교체하고 TTL을 14일로 되민다(슬라이딩).
	 * {@code oldJti}가 이미 없으면 <b>재사용 탐지</b>다 — 이 사용자의 세션 전체를 지우고 {@code false}를
	 * 반환한다(ADR-0005 결정 4 — "등록되지 않은 jti가 들어오면 Set을 통째로 DEL, 전 기기 로그아웃").
	 */
	public boolean rotate(Long userId, String oldJti, String newJti) {
		String key = key(userId);
		if (!Boolean.TRUE.equals(redis.opsForSet().isMember(key, oldJti))) {
			redis.delete(key);
			return false;
		}
		redis.opsForSet().remove(key, oldJti);
		redis.opsForSet().add(key, newJti);
		redis.expire(key, TTL);
		return true;
	}

	/** 로그아웃 — 이 사용자의 리프레시 세션을 전부 지운다. */
	public void revokeAll(Long userId) {
		redis.delete(key(userId));
	}

	private String key(Long userId) {
		return KEY_PREFIX + userId;
	}
}
