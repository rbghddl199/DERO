// 관리자 템플릿 시딩 화면 — 운영진 배치를 템플릿으로 지정·해제한다(REQ-ADM-03, DERO-347).
//
// 목록은 `GET /placements?owner=me`다. 관리자 전용 목록 엔드포인트를 새로 파지 않았다 — 시딩하는
// 배치는 운영진 계정이 시뮬레이터에서 직접 만든 자기 배치라 `owner=me`가 그대로 그 집합이다.
//
// **토글 뒤에는 반드시 재조회한다.** 낙관적 갱신으로 로컬 상태만 뒤집으면 서버가 실제로 안 바뀌었을
// 때 화면만 켜져 있고, 이 화면의 존재 이유가 "지정한 상태가 실제로 남았는가"를 확인하는 것이다.

'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  listMyPlacements,
  markPlacementAsTemplate,
  unmarkPlacementAsTemplate,
} from '@/api/admin/placements';
import { toMasterErrorMessage } from '@/components/admin/masters/masterErrors';
import InlineNotice from '@/components/common/InlineNotice';
import {
  MASTER_GHOST_BUTTON_CLASS,
  MASTER_PRIMARY_BUTTON_CLASS,
  MASTER_TABLE_CELL_CLASS,
  MASTER_TABLE_HEAD_CLASS,
} from '@/constants/admin/masters';
import { PUBLISH_STATUS_LABEL } from '@/constants/placementPublish';
import type { PlacementSummaryResponse } from '@/types/placement';

const PlacementTemplatesAdmin = () => {
  const [items, setItems] = useState<PlacementSummaryResponse[]>([]);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  // 토글 뒤 같은 목록을 다시 읽기 위한 트리거. 진행 중인 배치 id는 버튼 두 번 눌림을 막는다.
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [loadedToken, setLoadedToken] = useState<number | null>(null);

  // 로딩은 파생값이다 — 이펙트 본문에서 setIsLoading(true)를 부르면
  // react-hooks/set-state-in-effect가 막는다(useMasterList와 같은 관례).
  const isLoading = loadedToken !== reloadToken;

  useEffect(() => {
    let isCurrent = true;

    listMyPlacements()
      .then((page) => {
        if (!isCurrent) return;
        setItems(page.content);
        setLoadErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        setItems([]);
        setLoadErrorMessage(toMasterErrorMessage(error, '배치 목록을 불러오지 못했습니다.'));
      })
      .finally(() => {
        if (!isCurrent) return;
        setLoadedToken(reloadToken);
      });

    return () => {
      isCurrent = false;
    };
  }, [reloadToken]);

  const toggle = useCallback(async (placement: PlacementSummaryResponse): Promise<void> => {
    setSubmitErrorMessage(null);
    setPendingId(placement.id);
    try {
      if (placement.isTemplate) {
        await unmarkPlacementAsTemplate(placement.id);
      } else {
        await markPlacementAsTemplate(placement.id);
      }
      setReloadToken((token) => token + 1);
    } catch (error: unknown) {
      setSubmitErrorMessage(toMasterErrorMessage(error, '템플릿 상태를 바꾸지 못했습니다.'));
    } finally {
      setPendingId(null);
    }
  }, []);

  return (
    <div>
      <h1 className="text-ink text-[28px] font-bold">템플릿 시딩</h1>
      <p className="text-ash mt-2 text-[15px] leading-6">
        운영진 계정으로 만든 배치를 컬렉션의 시작 템플릿으로 지정합니다. 템플릿 지정은 공개와
        별개입니다 — 컬렉션에 실제로 걸리려면 시뮬레이터에서 그 배치를 업로드해 상태가 &lsquo;
        {PUBLISH_STATUS_LABEL.PUBLIC}&rsquo;이 되어야 합니다.
      </p>

      {submitErrorMessage ? (
        <div className="mt-5">
          <InlineNotice variant="error" message={submitErrorMessage} />
        </div>
      ) : null}

      <section className="mt-8">
        {loadErrorMessage ? (
          <InlineNotice variant="error" message={loadErrorMessage} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={MASTER_TABLE_HEAD_CLASS}>ID</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>제목</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>공개 상태</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>템플릿</th>
                  <th className={MASTER_TABLE_HEAD_CLASS}>관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((placement) => (
                  <tr key={placement.id}>
                    <td className={`${MASTER_TABLE_CELL_CLASS} tabular-nums`}>{placement.id}</td>
                    <td className={MASTER_TABLE_CELL_CLASS}>{placement.title}</td>
                    <td className={`${MASTER_TABLE_CELL_CLASS} text-ash`}>
                      {PUBLISH_STATUS_LABEL[placement.publishStatus]}
                    </td>
                    <td className={MASTER_TABLE_CELL_CLASS}>
                      {placement.isTemplate ? '지정됨' : '—'}
                    </td>
                    <td className={MASTER_TABLE_CELL_CLASS}>
                      <button
                        type="button"
                        disabled={pendingId === placement.id || isLoading}
                        onClick={() => {
                          void toggle(placement);
                        }}
                        className={
                          placement.isTemplate
                            ? MASTER_GHOST_BUTTON_CLASS
                            : MASTER_PRIMARY_BUTTON_CLASS
                        }
                      >
                        {placement.isTemplate ? '템플릿 해제' : '템플릿 지정'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!isLoading && items.length === 0 ? (
              <p className="text-ash mt-6 text-[14px]">
                이 계정으로 만든 배치가 없습니다. 시뮬레이터에서 배치를 저장한 뒤 다시 열어 주세요.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
};

export default PlacementTemplatesAdmin;
