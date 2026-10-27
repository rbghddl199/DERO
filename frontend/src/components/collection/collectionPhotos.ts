// CollectionPost.photoId → 실제 샘플 이미지 — 실제 배치 썸네일 API 대신 쓰는 사진 3장을 정적 import해
// 매핑한다(2026-07-30). 카드·배너·상세가 전부 이 함수를 거쳐 같은 사진을 가리킨다.
// getCollectionCoverImage는 실제 원격 표지(AI 상상도 대표 1장)까지 아우르는 상위 resolver —
// 카드·배너·상세는 getCollectionPhoto를 직접 부르지 말고 이걸 거칠 것(2026-07-31).

import type { StaticImageData } from 'next/image';
import blackDesk from '@/assets/sample/black_desk/black_desk.webp';
import designDesk from '@/assets/sample/design_desk/design_desk.webp';
import whiteDesk from '@/assets/sample/white_desk/white_desk.webp';
import type { CollectionPhotoId } from '@/constants/collectionPosts';
import { hashString } from '@/utils/avatarPalette';

const COLLECTION_PHOTOS: Record<CollectionPhotoId, StaticImageData> = {
  black_desk: blackDesk,
  design_desk: designDesk,
  white_desk: whiteDesk,
};

export function getCollectionPhoto(photoId: CollectionPhotoId): StaticImageData {
  return COLLECTION_PHOTOS[photoId];
}

const PHOTO_IDS = Object.keys(COLLECTION_PHOTOS) as CollectionPhotoId[];

/**
 * 원격 표지 URL(대표 상상도의 presigned GET URL)이 있으면 그걸 쓰고, 없으면 샘플 사진으로 폴백한다.
 * 로드에 실패했을 때 URL을 빼고 다시 부르는 건 `CollectionCoverImage`의 몫이다.
 *
 * 폴백을 `seed`로 흩뜨리는 이유: 2026-08-01부터 목록이 실제 배치라 photoId가 아무에게도 없다
 * (DERO-339). 고정 기본값 하나로 두면 아직 썸네일을 안 찍은 배치가 전부 같은 사진이 되어
 * 컬렉션가 같은 카드 12장처럼 보인다. 해시라 새로고침해도 같은 배치는 같은 사진이다.
 */
export function getCollectionCoverImage(
  photoId: CollectionPhotoId | undefined,
  remoteUrl: string | undefined,
  seed = '',
): string | StaticImageData {
  if (remoteUrl) return remoteUrl;
  return getCollectionPhoto(photoId ?? PHOTO_IDS[hashString(seed) % PHOTO_IDS.length]);
}
