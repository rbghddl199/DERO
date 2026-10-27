'use client';
// /craft 목록 조회를 브라우저에서 수행한다 — 액세스 토큰은 브라우저 메모리에만 살기 때문에
// (ADR-0005 결정 3) 서버 컴포넌트에서 getDeskProjects()를 부르면 Node엔 토큰이 없어 익명 요청이
// 되고, 선택적 인증이 걸린 GET /placements가 PUBLIC 배치만 돌려준다 — "내 데스크테리어" 화면이
// 남의 공개 배치 목록을 보여주게 된다.
//
// 'failed' = 조회 실패, 'loaded' + 빈 배열 = 정상 조회했지만 만든 게 없음(빈 상태 안내).
// 서버 컴포넌트가 하던 이 구분을 그대로 옮겨 왔다 — 뭉개면 "진짜 빈 목록"과 "인증 실패"가
// 화면에서 똑같아진다(craft/CLAUDE.md).

import { useEffect, useState } from 'react';

import { getDeskProjects } from '@/api/craft';
import LoadingState from '@/components/common/LoadingState';
import type { DeskProject } from '@/types/craft';
import CraftDeskCollection from './CraftDeskCollection';
import CraftLoadErrorState from './CraftLoadErrorState';

type LoadState =
  { status: 'loading' } | { status: 'loaded'; projects: DeskProject[] } | { status: 'failed' };

const CraftDeskCollectionLoader = () => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  // 재시도는 이 토큰을 올려 아래 effect를 다시 태운다 — 이벤트 핸들러에서 fetch를 직접 부르면
  // 취소 처리를 두 곳에 두게 된다.
  const [reloadToken, setReloadToken] = useState(0);

  // setState는 전부 then/catch 콜백 안에서만 부른다 — effect 본문에서 동기로 부르면
  // react-hooks/set-state-in-effect에 걸린다(CraftDeskPicker.tsx의 템플릿 조회와 같은 형태).
  useEffect(() => {
    let cancelled = false;
    getDeskProjects()
      .then((projects) => {
        if (!cancelled) setState({ status: 'loaded', projects });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (state.status === 'loading') {
    return (
      <LoadingState
        label="데스크테리어를 불러오는 중"
        description="지금까지 만든 데스크테리어를 가져오고 있습니다."
      />
    );
  }

  if (state.status === 'failed') {
    return (
      <CraftLoadErrorState
        onRetry={() => {
          setState({ status: 'loading' });
          setReloadToken((token) => token + 1);
        }}
      />
    );
  }

  return <CraftDeskCollection projects={state.projects} />;
};

export default CraftDeskCollectionLoader;
