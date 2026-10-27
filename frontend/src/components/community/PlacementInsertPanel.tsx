'use client';
// 글 작성·수정 화면의 "배치 삽입" 후보 목록 — 본문에 `[[placement:ID]]` 토큰을 꽂는다(ADR-0013 결정 1).
// 후보는 **작성자 본인의 공개 배치**뿐이다(결정 3) — 내 비공개 배치는 애초에 목록에 안 뜬다.
// 공개 전환 UI는 여기 두지 않는다: 글 쓰는 도중 배치가 열리면 사용자가 그 노출을 인지하지 못한다
// (결정 3에서 자동 공개도 유도도 폐기됐다). 공개는 /craft의 '업로드'가 담당하는 별도 행위다.

import { useEffect, useState } from 'react';
import { listPlacements } from '@/api/placement';
import RemoteImage from '@/components/common/RemoteImage';
import { useAuthStore } from '@/store/authStore';
import type { PlacementSummaryResponse } from '@/types/placement';

const CANDIDATE_PAGE_SIZE = 50;

type Props = {
  /** 후보 객체를 통째로 넘긴다 — 작성 화면은 이걸 그대로 에디터 노드 attrs에 실어 카드를 그린다 */
  onInsert: (placement: PlacementSummaryResponse) => void;
};

type LoadState = 'loading' | 'ready' | 'error';

const PlacementInsertPanel = ({ onInsert }: Props) => {
  const [candidates, setCandidates] = useState<PlacementSummaryResponse[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  // `owner: 'me'`는 비로그인이면 401 PLACEMENT_OWNER_ME_REQUIRES_LOGIN이다 — 쏘면 401 자동 회전까지
  // 헛돌므로 로그인 상태에서만 부른다.
  const isAuthenticated = useAuthStore((s) => s.auth.status === 'authenticated');

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    listPlacements({ owner: 'me', publishStatus: 'PUBLIC', size: CANDIDATE_PAGE_SIZE })
      .then((page) => {
        if (cancelled) return;
        setCandidates(page.content);
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return (
    <div className="border-ash/40 rounded-[10px] border p-3">
      <p className="text-ink text-[14px] font-medium">내 공개 배치 삽입</p>
      <p className="text-ash mt-1 text-[13px] leading-[1.6]">
        컬렉션에 공개한 데스크테리어만 본문에 넣을 수 있어요.
      </p>

      {!isAuthenticated && (
        <p className="text-ash mt-3 text-[13px]">로그인하면 내 공개 배치를 넣을 수 있어요.</p>
      )}
      {isAuthenticated && loadState === 'loading' && (
        <p className="text-ash mt-3 text-[13px]">불러오는 중...</p>
      )}
      {loadState === 'error' && (
        <p className="text-ash mt-3 text-[13px]">배치 목록을 불러오지 못했어요.</p>
      )}
      {loadState === 'ready' && candidates.length === 0 && (
        <p className="text-ash mt-3 text-[13px]">
          공개한 배치가 없어요. 작업실에서 데스크테리어를 업로드한 뒤 다시 시도해주세요.
        </p>
      )}

      {loadState === 'ready' && candidates.length > 0 && (
        <ul className="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => onInsert(candidate)}
                className="border-ash/40 hover:bg-fog flex w-full cursor-pointer items-center gap-3 rounded-[10px] border p-2 text-left"
              >
                {candidate.thumbnailUrl && (
                  <RemoteImage
                    src={candidate.thumbnailUrl}
                    alt=""
                    width={64}
                    height={48}
                    sizes="64px"
                    className="bg-fog aspect-[4/3] w-16 shrink-0 rounded-[8px] object-cover"
                  />
                )}
                <span className="text-ink min-w-0 flex-1 truncate text-[14px]">
                  {candidate.title}
                </span>
                <span className="text-ash shrink-0 text-[13px]">삽입</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PlacementInsertPanel;
