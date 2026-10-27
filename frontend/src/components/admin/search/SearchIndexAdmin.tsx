'use client';
// 검색 인덱스 4종 재색인 화면 — 버튼과 결과 줄만 있는 얇은 화면이다.
//
// **이 화면이 필요한 이유**: 부팅은 빈 인덱스만 만들고 채우는 건 재색인 호출뿐이라, 새 인덱스가
// 붙은 배포 뒤에 사람이 한 번 눌러야 한다. 안 누르면 검색이 계속 0건인데 에러도 로그도 안 난다.
// 종전에는 제품 재색인만 브랜드 화면 구석에 있었고(SearchReindexButton — 브랜드 등록이 재색인을
// 부르는 정기 사건이라 거기 둔 것이라 그대로 둔다) 게시글·사용자·배치는 화면이 아예 없어 curl로만
// 됐다.
//
// 확인 절차(모달)를 두지 않는다 — 새 인덱스를 다 채운 뒤 별칭만 바꿔 다는 무중단 교체라
// (ADR-0019 결정 5) 잘못 눌러도 검색이 끊기지 않는다. 실패하면 별칭은 옛 인덱스에 그대로 남는다.

import { useState } from 'react';

import {
  reindexPlacementSearch,
  reindexPostSearch,
  reindexProductSearch,
  reindexUserSearch,
} from '@/api/admin/search';
import { toMasterErrorMessage } from '@/components/admin/masters/masterErrors';
import { MASTER_PRIMARY_BUTTON_CLASS } from '@/constants/admin/masters';

type SearchIndexTarget = {
  key: string;
  label: string;
  description: string;
  reindex: () => Promise<{ indexedCount: number }>;
};

const TARGETS: readonly SearchIndexTarget[] = [
  {
    key: 'products',
    label: '제품',
    description:
      '제품 검색과 자동완성. 브랜드를 등록·수정했으면 눌러야 새 브랜드명이 한 덩어리로 인식됩니다(사전을 여기서 다시 굽습니다).',
    reindex: reindexProductSearch,
  },
  {
    key: 'placements',
    label: '배치(컬렉션)',
    description: '컬렉션 검색과 태그. 배치를 공개해도 색인이 비어 있으면 검색에 안 걸립니다.',
    reindex: reindexPlacementSearch,
  },
  {
    key: 'posts',
    label: '게시글(커뮤니티)',
    description: '커뮤니티 검색. 제목·본문·해시태그를 담습니다.',
    reindex: reindexPostSearch,
  },
  {
    key: 'users',
    label: '사용자',
    description: '작성자 닉네임 검색. 게시글·배치 검색이 이 인덱스를 거쳐 작성자를 찾습니다.',
    reindex: reindexUserSearch,
  },
] as const;

/** 인덱스별 진행/결과 — 하나가 도는 동안 다른 인덱스는 그대로 누를 수 있어야 해서 키로 나눠 든다. */
type RunState = { status: 'running' } | { status: 'done'; message: string };

const SearchIndexAdmin = () => {
  const [runs, setRuns] = useState<Readonly<Record<string, RunState>>>({});

  const handleReindex = async (target: SearchIndexTarget): Promise<void> => {
    setRuns((current) => ({ ...current, [target.key]: { status: 'running' } }));
    try {
      // 건수를 그대로 띄운다 — 관리자가 성공을 눈으로 확인하라고 백엔드가 돌려주는 값이다.
      const result = await target.reindex();
      setRuns((current) => ({
        ...current,
        [target.key]: {
          status: 'done',
          message: `색인 완료 — ${result.indexedCount.toLocaleString()}건`,
        },
      }));
    } catch (error: unknown) {
      setRuns((current) => ({
        ...current,
        [target.key]: {
          status: 'done',
          message: toMasterErrorMessage(error, '재색인하지 못했습니다.'),
        },
      }));
    }
  };

  return (
    <div>
      <h1 className="text-ink text-[28px] font-bold">검색 색인</h1>
      <p className="text-ash mt-2 text-[15px] leading-6">
        인덱스를 통째로 다시 만듭니다. 새 인덱스를 다 채운 뒤 바꿔 달기 때문에 도는 동안에도 검색은
        그대로 됩니다.{' '}
        <strong className="text-ink">새 인덱스가 붙은 배포 뒤에는 한 번 눌러야</strong> 합니다 —
        부팅은 빈 인덱스만 만들어서, 안 누르면 검색이 계속 0건인데 에러도 안 납니다.
      </p>

      <ul className="mt-8 flex flex-col gap-4">
        {TARGETS.map((target) => {
          const run = runs[target.key];
          const isRunning = run?.status === 'running';

          return (
            <li key={target.key} className="border-ash/20 rounded-2xl border p-5">
              <span className="text-ink block text-[17px] font-semibold">{target.label}</span>
              <p className="text-ash mt-1 text-[13px] leading-5">{target.description}</p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={isRunning}
                  aria-busy={isRunning}
                  onClick={() => {
                    void handleReindex(target);
                  }}
                  className={MASTER_PRIMARY_BUTTON_CLASS}
                >
                  {isRunning ? '색인 중' : '다시 색인하기'}
                </button>
                {run !== undefined && (
                  <span className="text-ash text-[13px]">
                    {run.status === 'running' ? '전량을 다시 색인하는 중입니다…' : run.message}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default SearchIndexAdmin;
