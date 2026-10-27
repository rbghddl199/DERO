'use client';
// 컬렉션 표지 이미지 — 카드·인기 배너·상세가 공유한다. 부모가 `relative`인 자리에 채워 넣는다.
//
// 표지는 AI 상상도 대표 1장(post.thumbnailUrl에 실려 온다)이다 — 사용자가 찍은 3D 스크린샷이
// 아니다(ADR-0015 결정 7). 스크린샷은 내 작업실 카드용이고 컬렉션는 상상도만 그린다.
//
// 원격 표지도 이제 next/image다 — 조회 URL이 안정 공개 URL로 바뀌어 호스트를 remotePatterns에
// 등록할 수 있게 됐다(ADR-0035 결정 5, DERO-572). 번들 샘플 사진(StaticImageData)은 전과
// 같이 next/image 정적 import로 그린다.
//
// 썸네일 key가 결정론적이라 URL은 "있음"으로 보여도 아직 캡처 안 한 배치는 404다. truthy 여부로
// 판단할 수 없어서 로드 실패를 직접 감지해 샘플 표지로 폴백한다(craft/CLAUDE.md의 같은 함정).
// 실패 감지는 common/RemoteImage가 갖고 있고, 이 파일은 "실패하면 무엇을 그릴지"만 정한다.

import Image from 'next/image';
import RemoteImage from '@/components/common/RemoteImage';
import { getCollectionCoverImage } from './collectionPhotos';
import type { CollectionPost } from './types';

type Props = {
  post: CollectionPost;
  /** next/image 경로에만 쓰인다 */
  sizes?: string;
  priority?: boolean;
  className?: string;
};

const CollectionCoverImage = ({ post, sizes, priority = false, className = '' }: Props) => {
  const source = getCollectionCoverImage(post.photoId, post.thumbnailUrl, post.id);
  const samplePhoto = (
    <Image
      src={getCollectionCoverImage(post.photoId, undefined, post.id)}
      alt={post.title}
      fill
      sizes={sizes}
      priority={priority}
      className={`object-cover ${className}`}
    />
  );

  if (typeof source === 'string') {
    return (
      <RemoteImage
        src={source}
        alt={post.title}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-cover ${className}`}
        fallback={samplePhoto}
      />
    );
  }

  return samplePhoto;
};

export default CollectionCoverImage;
