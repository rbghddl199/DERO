package com.brunchies.dero.infra;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.util.FileCopyUtils;

/**
 * {@link StoragePort}의 로컬 디스크 구현 — {@code app.storage.local-dir} 아래에 key를 상대 경로로
 * 그대로 저장한다. key를 검증하지 않는다 — 유일한 호출자인 {@link LocalFileController}가 URL에서 온
 * key의 {@code ..}를 먼저 막는다(2026-07-31 이전엔 "도메인 서비스만 key를 조립한다"가 그 근거였다).
 *
 * <p>{@code app.storage.mode=local}(기본)일 때만 만들어진다 — {@link S3StoragePort}가 생기면서
 * 모드당 구현체가 정확히 하나여야 하고, {@link LocalFileController}·{@link LocalPresignService}가
 * 이미 같은 조건을 달고 있다.
 */
@Component
@ConditionalOnProperty(prefix = "app.storage", name = "mode", havingValue = "local", matchIfMissing = true)
public class LocalFileStoragePort implements StoragePort {

	private final Path baseDir;

	public LocalFileStoragePort(StorageProperties properties) {
		this.baseDir = Path.of(properties.localDir());
	}

	@Override
	public void store(String key, byte[] bytes) {
		try {
			Path target = resolveTarget(key);
			Files.createDirectories(target.getParent());
			FileCopyUtils.copy(bytes, target.toFile());
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	@Override
	public Optional<byte[]> load(String key) {
		try {
			Path target = resolveTarget(key);
			if (!Files.exists(target)) {
				return Optional.empty();
			}
			return Optional.of(FileCopyUtils.copyToByteArray(target.toFile()));
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	@Override
	public void delete(String key) {
		try {
			Files.deleteIfExists(resolveTarget(key));
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	private Path resolveTarget(String key) {
		return baseDir.resolve(key).normalize();
	}
}
