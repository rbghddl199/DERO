package com.brunchies.dero.infra;

import com.brunchies.dero.global.exception.BusinessException;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 로컬 서명 URL의 HMAC-SHA256 서명·검증. 발급({@link LocalPresignService})과
 * 검증({@link LocalFileController})이 <b>같은 규칙</b>을 쓰도록 한 곳에 모았다 — 양쪽에 따로
 * 적으면 한쪽만 고쳐도 컴파일이 통과하고 URL이 조용히 전부 403이 된다.
 *
 * <p>서명 대상은 {@code method + "\n" + key + "\n" + exp}다. <b>구분자가 있어야 한다</b> —
 * 그냥 이어붙이면 {@code key="a1", exp=234}와 {@code key="a12", exp=34}가 같은 문자열이 되어
 * 만료 시각을 바꿔치기할 수 있다.
 *
 * <p>method를 서명에 넣으므로 GET용 URL로 PUT을 할 수 없다(업로드 URL만 받은 사람이 조회를 하거나
 * 그 반대를 하는 걸 막는다).
 */
@Component
@ConditionalOnProperty(prefix = "app.storage", name = "mode", havingValue = "local", matchIfMissing = true)
public class LocalFileSigner {

	private static final String ALGORITHM = "HmacSHA256";

	private final byte[] secret;

	public LocalFileSigner(StorageProperties properties) {
		this.secret = properties.localSignSecret().getBytes(StandardCharsets.UTF_8);
	}

	/** 16진 소문자 서명 문자열. URL 쿼리에 그대로 실을 수 있다. */
	public String sign(String method, String key, long expiresAtEpochSecond) {
		try {
			Mac mac = Mac.getInstance(ALGORITHM);
			mac.init(new SecretKeySpec(secret, ALGORITHM));
			String payload = method + "\n" + key + "\n" + expiresAtEpochSecond;
			return HexFormat.of().formatHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
		} catch (NoSuchAlgorithmException | InvalidKeyException e) {
			// 검사 예외를 BusinessException으로 번역만 한다(architecture.md 규칙 8의 유일한 허용 용도).
			throw new BusinessException(StorageErrorCode.STORAGE_SIGN_FAILED);
		}
	}

	/** 만료 여부까지 함께 본다. 비교는 {@link MessageDigest#isEqual}로 — 길이가 같으면 상수 시간이다. */
	public boolean isValid(String method, String key, long expiresAtEpochSecond, String signature) {
		if (expiresAtEpochSecond < Instant.now().getEpochSecond()) {
			return false;
		}
		return MessageDigest.isEqual(
				sign(method, key, expiresAtEpochSecond).getBytes(StandardCharsets.UTF_8),
				signature.getBytes(StandardCharsets.UTF_8));
	}
}
