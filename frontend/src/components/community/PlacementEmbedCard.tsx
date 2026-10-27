// 본문 `[[placement:ID]]` 토큰 자리에 그리는 배치 카드 (ADR-0013 결정 4).
// 참조 대상이 사라졌으면 카드를 생략하지 않고 "삭제된 배치입니다" 플레이스홀더를 그린다 —
// 카드가 통째로 없어지면 앞뒤 문장이 무엇을 가리키는지 알 수 없게 된다.
import Link from 'next/link';
import RemoteImage from '@/components/common/RemoteImage';
import type { PlacementSummaryResponse } from '@/types/placement';

type Props = {
  placementId: number;
  /** 조회 결과에 없으면 undefined — 삭제됐거나 비공개가 된 배치다 */
  placement: PlacementSummaryResponse | undefined;
};

const formatBudget = (budgetKrw: number | null): string | null =>
  budgetKrw === null ? null : `${budgetKrw.toLocaleString('ko-KR')}원`;

const PlacementEmbedCard = ({ placementId, placement }: Props) => {
  if (!placement) {
    return (
      <div className="border-ash/40 text-ash my-4 rounded-2xl border border-dashed px-4 py-6 text-center text-[14px]">
        삭제된 배치입니다.
      </div>
    );
  }

  const budget = formatBudget(placement.budgetKrw);

  return (
    <Link
      href={`/collection/${placement.id}`}
      className="border-ash/40 hover:bg-fog my-4 flex gap-4 rounded-2xl border p-4 transition-colors"
      aria-label={`배치 ${placement.title} 보기`}
    >
      {placement.thumbnailUrl && (
        <RemoteImage
          src={placement.thumbnailUrl}
          alt=""
          width={160}
          height={120}
          sizes="(min-width: 640px) 160px, 128px"
          className="bg-fog aspect-[4/3] w-32 shrink-0 rounded-[10px] object-cover sm:w-40"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className="text-ash text-[12px] font-medium tracking-[0.08em]">데스크테리어 배치</p>
        <h4 className="text-ink mt-1 truncate text-[16px] font-medium">{placement.title}</h4>
        {placement.description && (
          <p className="text-ash mt-1 line-clamp-2 text-[13px] leading-[1.6]">
            {placement.description}
          </p>
        )}
        <div className="text-ash mt-2 flex items-center gap-3 text-[13px] tabular-nums">
          {budget && <span className="text-ink font-medium">{budget}</span>}
          <span>좋아요 {placement.likeCount}</span>
        </div>
      </div>
      <span className="sr-only">배치 #{placementId}</span>
    </Link>
  );
};

export default PlacementEmbedCard;
