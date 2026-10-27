package com.brunchies.dero.product;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * GLB export 방식 — <b>한 GLB가 관절과 텍스처를 동시에 가질 수 없다</b>(asset-pipeline.md,
 * 2026-07-18 승인).
 *
 * <ul>
 *   <li>{@code PART_SEGMENTATION} — 파트별 분리 메쉬, 텍스처 없음. 로더가 {@code asset.finish}가
 *       가리키는 코드 재질 프리셋을 전 메쉬에 입힌다
 *   <li>{@code TEXTURE} — 융합 메쉬 + PBR 텍스처. 재질 정본이 GLB 안에 있다
 * </ul>
 *
 * <p>{@code TEXTURE}인데 재질을 덮으면 KTX2 텍스처가 죽고, {@code PART_SEGMENTATION}인데 안 덮으면
 * 무재질 회색이 된다 — 그래서 등록자가 이 구분을 입력한다(REQ-ADM-01).
 *
 * <p><b>{@code rig_manifest} 유무로 대체하지 않는다</b> — 지금은 둘이 사실상 일치하지만 로더가 묻는
 * 질문이 다르다("재질을 덮을 것인가" vs "관절이 있는가"). 겹친다고 한쪽을 지우면 텍스처를 가진 관절
 * GLB가 들어오는 날 그 텍스처를 잘못 덮는다({@code docs/context/erd.md} {@code asset} 절).
 */
@Getter
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public enum GlbExportMode {
  PART_SEGMENTATION("파트별 분리 메쉬, 텍스처 없음. 로더가 finish 프리셋을 전 메쉬에 입힌다."),
  TEXTURE("융합 메쉬 + PBR 텍스처. 재질 정본이 GLB 안에 있다.");

  private final String description;
}
