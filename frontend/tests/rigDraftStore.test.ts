// 리그 저작 스토어의 매니페스트 단일 필드 편집 — 결합 세그먼트(mountPart) 지정·해제·세그먼트 삭제 시 참조 정리
import { describe, it, expect, beforeEach } from 'vitest';
import { useRigDraftStore } from '@/store/rigDraftStore';
import { toManifest } from '@/three/core/rigDraft';

/** 매 테스트가 같은 초안에서 출발하게 한다 — 스토어는 모듈 싱글턴이라 상태가 남는다. */
beforeEach(() => {
  useRigDraftStore.setState({
    draft: { segments: { 'clamp-base': ['mesh_1'], 'head-mount': ['mesh_0'] }, joints: [] },
    errors: [],
  });
});

const manifest = () => toManifest(useRigDraftStore.getState().draft);

describe('setMountPart', () => {
  it('고른 세그먼트가 매니페스트의 mountPart로 실린다', () => {
    useRigDraftStore.getState().setMountPart('head-mount');

    expect(manifest().mountPart).toBe('head-mount');
  });

  it('null로 다시 부르면 키가 아예 사라진다 (빈 문자열로 남지 않는다)', () => {
    const store = useRigDraftStore.getState();
    store.setMountPart('head-mount');
    store.setMountPart(null);

    expect('mountPart' in manifest()).toBe(false);
  });

  it('지지 세그먼트를 바꿔도 결합 세그먼트는 그대로다', () => {
    const store = useRigDraftStore.getState();
    store.setMountPart('head-mount');
    store.setSupportPart('clamp-base');

    const m = manifest();
    expect(m.mountPart).toBe('head-mount');
    expect(m.supportPart).toBe('clamp-base');
  });

  it('결합 세그먼트로 지정한 세그먼트를 지우면 참조도 끊긴다', () => {
    const store = useRigDraftStore.getState();
    store.setMountPart('head-mount');
    store.deleteSegment('head-mount');

    expect('mountPart' in manifest()).toBe(false);
  });
});
