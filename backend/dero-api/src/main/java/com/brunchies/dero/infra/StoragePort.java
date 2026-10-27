package com.brunchies.dero.infra;

import java.util.Optional;

/**
 * 오브젝트 스토리지 포트(package-info.java "포트는 정확히 3곳"). 구현은
 * {@code app.storage.mode}가 가른다 — {@code local}(기본)이면 {@link LocalFileStoragePort},
 * {@code s3}면 {@link S3StoragePort}다({@link PresignPort}가 갈리는 것과 같은 관용구).
 */
public interface StoragePort {

	void store(String key, byte[] bytes);

	Optional<byte[]> load(String key);

	void delete(String key);
}
