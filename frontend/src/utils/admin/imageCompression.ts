// 업로드 이미지를 브라우저에서 webp로 강제 재인코딩한다 — presign MIME 허용표가 image/webp뿐이라
// (ADR-0035 결정 4, DERO-574) webp가 아닌 바이트는 발급 단계에서 400이다. 관리자 전용 압축
// 유틸이었으나 573에서 전 업로드 경로(프로필·게시글·데스크피드·브랜드 로고) 공용으로 승격됐다.
//
// 2026-08-05 실측: 기존 상품 이미지의 PNG 179장이 그 접두사 342.6MB의 90.5%를 차지했고, 그 원인은
// "webp가 아니라서"가 아니라 사진을 무손실 PNG로 저장한 것이었다. 같은 파일이 다시 올라오는 것을 막는다.
//
// 값은 일회성 이관 스크립트(scripts/webp-migrate.mjs의 EDGE·QUALITY)와 같아야 한다 — 다르면 배치로
// 줄인 이미지와 새로 올라온 이미지의 화질·크기가 갈린다. 0.82 ↔ 82로 표기만 다르다.
//
// 서버가 아니라 브라우저에서 하는 이유: 업로드가 presigned PUT이라 서버는 바이트를 보지 못한다.
// 서버에서 압축하려면 업로드 흐름을 multipart로 전면 재작업해야 하고, Java 표준 ImageIO는 webp
// 인코딩을 지원하지 않아 새 의존성이 필요하다.

/** 긴 변 상한(px). 이보다 작은 이미지는 리사이즈하지 않는다. */
export const COMPRESSED_LONG_EDGE = 1280;

/** webp 품질. q75가 아닌 이유 — 이 서비스는 사용자가 제품 색 조화를 판단하는 도구다(DESIGN-SYSTEM §1.5). */
export const COMPRESSED_QUALITY = 0.82;

export const WEBP_CONTENT_TYPE = 'image/webp';

export type PreparedUpload = {
  /** PUT 본문. 원본이 이미 webp면 원본 File 그대로다. */
  blob: Blob;
  /** presign 요청과 PUT 헤더에 **같이** 넣을 값. 두 곳이 갈리면 S3 서명 검증이 거절한다. 항상 webp다. */
  contentType: string;
  /** 백엔드 MIME표가 확장자를 정하므로 key에는 안 쓰이지만, 계약 필드로 계속 보낸다. */
  fileName: string;
  /** 재인코딩된 경우에만 true. 화면이 "원본으로 올렸다"를 알릴 수 있게 드러낸다. */
  isCompressed: boolean;
};

/** 긴 변 상한을 적용한 목표 치수. 원본보다 키우지 않는다. */
export const fitWithinLongEdge = (
  width: number,
  height: number,
  longEdge: number,
): { width: number; height: number } => {
  const longest = Math.max(width, height);
  if (longest <= longEdge) return { width, height };

  const scale = longEdge / longest;
  return {
    // 0px 캔버스는 toBlob이 null을 주므로 최소 1px을 보장한다.
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

/** 확장자를 .webp로 바꾼 파일명. 점이 없으면 붙인다. */
const toWebpFileName = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf('.');
  return `${dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName}.webp`;
};

/**
 * 캔버스를 webp Blob으로 굽는다. Safari는 {@code toBlob('image/webp')}가 조용히 PNG로 떨어지므로
 * 결과 타입을 검사해 wasm 인코더(@jsquash/webp)로 폴백한다 — best-effort가 아니라 보장이 목표다
 * (ADR-0035 결정 4). 인코더는 폴백 경로에서만 동적 import되므로 크롬 계열은 wasm을 내려받지 않는다.
 */
export const canvasToWebpBlob = async (
  canvas: HTMLCanvasElement,
  quality: number = COMPRESSED_QUALITY,
): Promise<Blob> => {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, WEBP_CONTENT_TYPE, quality);
  });
  if (blob !== null && blob.type === WEBP_CONTENT_TYPE) return blob;

  const context = canvas.getContext('2d');
  if (context === null) throw new Error('이미지를 webp로 변환하지 못했습니다.');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { default: encode } = await import('@jsquash/webp/encode');
  const encoded = await encode(imageData, { quality: Math.round(quality * 100) });
  return new Blob([encoded], { type: WEBP_CONTENT_TYPE });
};

/**
 * 업로드할 파일을 webp로 재인코딩한다. blob·contentType·fileName을 **한 객체로 함께** 돌려주는
 * 것이 요점이다 — 세 값이 갈리면 서명 불일치나 거짓 확장자가 되고, 그 사고가 이미 기록돼 있다
 * (`src/components/admin/CLAUDE.md`).
 *
 * 종전의 "실패하면 원본 그대로" 정책은 폐기됐다 — 서버가 webp만 받으므로(574) 원본 업로드는 어차피
 * 400이다. 디코딩 실패는 그대로 던져 호출부의 에러 UI가 받는다. GIF는 첫 프레임만 남는다(정지 이미지
 * 갤러리라 수용, ADR-0035).
 */
export const prepareImageForUpload = async (
  file: File,
  contentType: string,
): Promise<PreparedUpload> => {
  // 이미 webp면 재인코딩이 화질만 깎는다 — 그대로 올린다.
  if (contentType === WEBP_CONTENT_TYPE) {
    return { blob: file, contentType, fileName: file.name, isCompressed: false };
  }

  // imageOrientation을 빼면 EXIF 회전이 무시돼 휴대폰 사진이 눕는다 — 캔버스는 방향을 안 읽는다.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const target = fitWithinLongEdge(bitmap.width, bitmap.height, COMPRESSED_LONG_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext('2d');
    if (context === null) throw new Error('이미지를 webp로 변환하지 못했습니다.');
    // 배경을 칠하지 않는다 — 투명 PNG의 알파를 webp가 그대로 받는다.
    context.drawImage(bitmap, 0, 0, target.width, target.height);

    const blob = await canvasToWebpBlob(canvas);
    return {
      blob,
      contentType: WEBP_CONTENT_TYPE,
      fileName: toWebpFileName(file.name),
      isCompressed: true,
    };
  } finally {
    bitmap.close();
  }
};
