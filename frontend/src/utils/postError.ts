// 게시글 저장 실패를 사용자 문구로 옮긴다 — 백엔드 ProblemDetail.code(constants/post.ts) 기준.
// utils/placementPublishError.ts와 같은 자리·같은 규약이다.

import { ApiError } from '@/api/client';
import { POST_ERROR_CODES } from '@/constants/post';

export function toPostSaveErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return '글을 저장하지 못했어요. 잠시 후 다시 시도해주세요.';
  }

  switch (error.problem?.code) {
    case POST_ERROR_CODES.placementNotEmbeddable:
      return '본문에 넣은 배치 중 삽입할 수 없는 것이 있어요. 내가 공개한 배치만 넣을 수 있습니다.';
    case POST_ERROR_CODES.imageLimitExceeded:
      return '사진은 한 글에 20장까지만 넣을 수 있어요.';
    case POST_ERROR_CODES.unsupportedImageType:
      return 'PNG·JPG·WEBP·GIF 파일만 올릴 수 있어요.';
    case POST_ERROR_CODES.invalidImageKey:
    case POST_ERROR_CODES.imageNotFound:
      return '사진을 등록하지 못했어요. 다시 올려주세요.';
    case POST_ERROR_CODES.postNotOwned:
      return '내 글만 수정할 수 있어요.';
    case POST_ERROR_CODES.postNotFound:
      return '이미 삭제된 글이에요.';
    default:
      // 서버가 한국어 detail을 싣는다 — 있으면 그대로 쓴다(에러 코드를 프론트가 다 알 필요가 없다).
      return error.problem?.detail ?? '글을 저장하지 못했어요. 잠시 후 다시 시도해주세요.';
  }
}
