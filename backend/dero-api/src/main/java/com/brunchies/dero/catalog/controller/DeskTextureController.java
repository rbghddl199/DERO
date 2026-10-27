package com.brunchies.dero.catalog.controller;

import com.brunchies.dero.catalog.dto.DeskTexturePublicResponse;
import com.brunchies.dero.catalog.service.DeskTextureService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 공개 상판 재질 목록(`GET /api/v1/desk-textures`, DERO-325) — 비로그인 포함 누구나 본다(책상
 * 커스터마이징 미리보기는 로그인 전에도 떠야 한다). 관리자 전용 {@code DeskTextureResponse}는 raw 맵
 * key를 그대로 내보내 여기 재사용하지 않는다 — presigned URL로 바꾼 {@link DeskTexturePublicResponse}를
 * 새로 만들었다. 지금 2건뿐이라 페이지네이션 없이 평평한 배열 하나로 내린다.
 */
@RestController
@RequestMapping("/api/v1/desk-textures")
@RequiredArgsConstructor
public class DeskTextureController {

	private final DeskTextureService deskTextureService;

	@GetMapping
	public ResponseEntity<List<DeskTexturePublicResponse>> list() {
		return ResponseEntity.ok(deskTextureService.list());
	}
}
