package com.brunchies.dero.user.controller;

import com.brunchies.dero.user.dto.AdminTermsContentUploadUrlRequest;
import com.brunchies.dero.user.dto.AdminTermsContentUploadUrlResponse;
import com.brunchies.dero.user.dto.AdminTermsCreateRequest;
import com.brunchies.dero.user.dto.AdminTermsResponse;
import com.brunchies.dero.user.service.AdminTermsService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 관리자 약관 개정 이력 조회·본문 업로드·새 회차 발행 API. */
@RestController
@RequestMapping("/api/v1/admin/terms")
@RequiredArgsConstructor
public class AdminTermsController {

	private final AdminTermsService adminTermsService;

	@GetMapping
	public ResponseEntity<List<AdminTermsResponse>> list() {
		return ResponseEntity.ok(adminTermsService.listRevisions());
	}

	@PostMapping
	public ResponseEntity<AdminTermsResponse> create(
			@Valid @RequestBody AdminTermsCreateRequest request) {
		AdminTermsResponse response = adminTermsService.createRevision(request);
		return ResponseEntity.created(URI.create("/api/v1/admin/terms/" + response.id())).body(response);
	}

	@PostMapping("/content/upload-url")
	public ResponseEntity<AdminTermsContentUploadUrlResponse> presignContentUpload(
			@RequestParam String code,
			@Valid @RequestBody AdminTermsContentUploadUrlRequest request) {
		return ResponseEntity.ok(
				adminTermsService.presignContentUpload(code, request.contentType()));
	}
}
