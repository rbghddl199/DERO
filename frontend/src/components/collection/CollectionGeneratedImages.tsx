'use client';
// 배치 상세의 AI 상상도 — `GET /placements/{id}/generated-images`.
//
// 한 업로드가 정확히 IMAGES_PER_UPLOAD장을 만들고 그중 `isPrimary` 1장이 컬렉션 대표다
// (ADR-0015 결정 6). 각도를 구분하는 컬럼이 없어 대표 외의 순서는 `createdAt`이 답한다.
//
// `url`은 안정 공개 URL이라 `common/RemoteImage`(next/image)로 그린다(ADR-0035 결정 5).
//
// 아직 업로드 안 했거나 PENDING인 배치는 빈 배열이 정상이다 — 그때는 통째로 안 그린다. 조회
// 실패도 마찬가지로 조용히 넘긴다(상세의 본체는 배치 자체이지 이 섹션이 아니다).

import { useEffect, useState } from 'react';
import RemoteImage from '@/components/common/RemoteImage';
import { getGeneratedImages } from '@/api/placement';
import type { GeneratedImageResponse } from '@/types/placement';

type Props = {
  placementId: number;
};

// 업로드 1회가 만드는 상상도 장 수. 백엔드 `FeedEntryService.IMAGES_PER_UPLOAD`와 같은 값이어야
// 한다(2026-08-06 3→1 개정) — 여기가 크면 재게시 이력이 섞여 보이고, 작으면 만든 장이 잘린다.
const IMAGES_PER_UPLOAD = 1;

/** 대표 1장을 항상 앞에 세운다 — 그 뒤는 서버가 준 순서(createdAt)를 그대로 둔다. */
function primaryFirst(images: GeneratedImageResponse[]): GeneratedImageResponse[] {
  const currentPrimary = images.find((image) => image.isPrimary);
  if (!currentPrimary) return images.slice(-IMAGES_PER_UPLOAD);

  // 재게시 이력이 남아 있어 API가 과거 상상도까지 돌려주더라도 현재 대표가 생성된 묶음만 그린다.
  // 서버도 최신 묶음만 반환하지만, 배포 순서가 엇갈릴 때 옛 장이 잠깐 보이지 않게 하는 방어선이다.
  const currentBatch = images
    .filter((image) => image.id >= currentPrimary.id)
    .sort((a, b) => a.id - b.id)
    .slice(0, IMAGES_PER_UPLOAD);
  return [currentPrimary, ...currentBatch.filter((image) => image.id !== currentPrimary.id)].slice(
    0,
    IMAGES_PER_UPLOAD,
  );
}

const CollectionGeneratedImages = ({ placementId }: Props) => {
  const [images, setImages] = useState<GeneratedImageResponse[]>([]);

  useEffect(() => {
    let cancelled = false;
    getGeneratedImages(placementId)
      .then((list) => {
        if (!cancelled) setImages(list);
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [placementId]);

  if (images.length === 0) return null;

  const [primary, ...rest] = primaryFirst(images);

  return (
    <section className="font-swiss mt-12 tracking-[-0.03em]" data-testid="generated-images">
      <h2 className="text-ink mb-1 text-[20px] font-medium">AI 상상도</h2>
      <p className="text-ash mb-4 text-[14px] leading-6">
        업로드한 배치를 바탕으로 만든 이미지예요. 맨 위 이미지가 컬렉션 대표입니다.
      </p>

      <div className="bg-fog relative aspect-video w-full overflow-hidden rounded-2xl">
        <RemoteImage
          src={primary.url}
          alt="AI 상상도 대표 이미지"
          fill
          sizes="(min-width: 1024px) 720px, 100vw"
          className="object-cover"
        />
      </div>

      {rest.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {rest.map((image) => (
            <div key={image.id} className="bg-fog relative aspect-video overflow-hidden rounded-xl">
              <RemoteImage
                src={image.url}
                alt="AI 상상도"
                fill
                sizes="(min-width: 1024px) 360px, 50vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default CollectionGeneratedImages;
