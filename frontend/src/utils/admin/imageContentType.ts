// 관리자 이미지 업로드 — presign에 보낼 Content-Type을 정한다. 브라우저가 File.type을 빈 문자열로
// 주는 경우가 있어(OS에 MIME이 등록 안 된 확장자, 드래그 소스가 타입을 안 실은 경우) 확장자로 메운다.
// 백엔드 MIME표가 최종 판정한다(ProductImageService·AdminBrandService — webp만 허용, ADR-0035). 빈 타입 그대로
// 보내면 400 PRODUCT_INVALID_IMAGE_CONTENT_TYPE으로 떨어진다.

const EXTENSION_CONTENT_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
};

/** file input의 accept — `image/*`만 두면 OS 파일 대화상자가 webp를 걸러내는 환경이 있다. */
export const IMAGE_FILE_ACCEPT = 'image/*,.png,.jpg,.jpeg,.webp,.avif,.gif';

/** 업로드 가능한 이미지면 Content-Type, 아니면 null. */
export const resolveImageContentType = (file: File): string | null => {
  if (file.type.startsWith('image/')) return file.type;

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_CONTENT_TYPES[extension] ?? null;
};
