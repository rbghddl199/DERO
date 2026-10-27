package com.brunchies.dero.user.service;

import com.brunchies.dero.global.exception.BusinessException;
import com.brunchies.dero.infra.PresignPort;
import com.brunchies.dero.user.Terms;
import com.brunchies.dero.user.UserErrorCode;
import com.brunchies.dero.user.dto.AdminTermsContentUploadUrlResponse;
import com.brunchies.dero.user.dto.AdminTermsCreateRequest;
import com.brunchies.dero.user.dto.AdminTermsResponse;
import com.brunchies.dero.user.repository.TermsRepository;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 약관은 수정·삭제하지 않고 새 revision 행만 추가한다. */
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class AdminTermsService {

	private static final Pattern CODE_PATTERN = Pattern.compile("[A-Z0-9_]{1,30}");
	private static final String CONTENT_TYPE = "text/markdown";
	private static final String KEY_PREFIX = "terms/";

	private final TermsRepository terms;
	private final PresignPort presignPort;

	public List<AdminTermsResponse> listRevisions() {
		return terms.findAllByOrderByCodeAscRevisionDesc().stream()
				.map(item -> AdminTermsResponse.from(item, contentUrlOf(item)))
				.toList();
	}

	@Transactional
	public AdminTermsResponse createRevision(AdminTermsCreateRequest request) {
		String code = normalizedCode(request.code());
		Terms latest = terms.findFirstByCodeOrderByRevisionDesc(code)
				.orElseThrow(() -> new BusinessException(UserErrorCode.USER_TERMS_NOT_FOUND));
		if (!request.contentKey().startsWith(KEY_PREFIX + code.toLowerCase(Locale.ROOT) + "/")
				|| !request.contentKey().endsWith(".md")) {
			throw new BusinessException(UserErrorCode.USER_TERMS_CONTENT_KEY_INVALID);
		}
		Terms created = terms.save(Terms.create(code, latest.getRevision() + 1,
				request.title().trim(), request.contentKey(), request.required(), request.effectiveAt()));
		return AdminTermsResponse.from(created, contentUrlOf(created));
	}

	public AdminTermsContentUploadUrlResponse presignContentUpload(String rawCode, String contentType) {
		String code = normalizedCode(rawCode);
		if (!CONTENT_TYPE.equals(contentType.toLowerCase(Locale.ROOT))) {
			throw new BusinessException(UserErrorCode.USER_TERMS_CONTENT_TYPE_INVALID);
		}
		if (!terms.existsByCode(code)) {
			throw new BusinessException(UserErrorCode.USER_TERMS_NOT_FOUND);
		}
		String contentKey = KEY_PREFIX + code.toLowerCase(Locale.ROOT) + "/" + UUID.randomUUID() + ".md";
		return new AdminTermsContentUploadUrlResponse(contentKey,
				presignPort.presignUpload(contentKey, CONTENT_TYPE));
	}

	private static String normalizedCode(String code) {
		String normalized = code.trim().toUpperCase(Locale.ROOT);
		if (!CODE_PATTERN.matcher(normalized).matches()) {
			throw new BusinessException(UserErrorCode.USER_TERMS_CODE_INVALID);
		}
		return normalized;
	}

	private String contentUrlOf(Terms item) {
		return item.getContentKey() == null ? null : presignPort.presignGet(item.getContentKey());
	}
}
