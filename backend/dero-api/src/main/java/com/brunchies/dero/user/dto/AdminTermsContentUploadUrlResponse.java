package com.brunchies.dero.user.dto;

/** 업로드 후 새 개정 발행 요청에 contentKey를 그대로 전달한다. */
public record AdminTermsContentUploadUrlResponse(String contentKey, String uploadUrl) {
}
