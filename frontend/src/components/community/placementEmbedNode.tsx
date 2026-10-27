// Tiptap 커스텀 atom 노드 — 작성 에디터 안에서 배치 삽입 자리를 실제 PlacementEmbedCard로 보여준다.
// 저장 시엔 serializeEditorContent가 이 노드를 다시 `[[placement:ID]]` 토큰 문자열로 되돌린다
// (ADR-0013 결정 1 — 저장 포맷은 여전히 토큰이고, 노드는 에디터 표현 계층일 뿐이다).
'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import type { PlacementSummaryResponse } from '@/types/placement';
import PlacementEmbedCard from './PlacementEmbedCard';

const PlacementEmbedView = ({ node, deleteNode }: NodeViewProps) => {
  const placementId = node.attrs.placementId as number;
  // 삽입 시점에 PlacementInsertPanel이 들고 있던 후보 객체를 그대로 실어둔 세션용 스냅샷이다 —
  // 저장 문자열엔 id만 들어가므로 TTL 있는 thumbnailUrl이 본문에 새어나갈 일은 없다.
  const placement = node.attrs.placement as PlacementSummaryResponse | null;

  return (
    <NodeViewWrapper contentEditable={false} className="group relative my-2">
      {/* PlacementEmbedCard는 next/link라 편집 중 클릭하면 /collection로 이동해버린다 */}
      <div onClickCapture={(event) => event.preventDefault()}>
        <PlacementEmbedCard placementId={placementId} placement={placement ?? undefined} />
      </div>
      <button
        type="button"
        onClick={deleteNode}
        aria-label="배치 삽입 취소"
        className="bg-ink text-paper absolute top-1 right-1 hidden h-6 w-6 cursor-pointer items-center justify-center rounded-full text-[13px] group-hover:flex"
      >
        ×
      </button>
    </NodeViewWrapper>
  );
};

export const PlacementEmbedNode = Node.create({
  name: 'placementEmbed',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      placementId: { default: null },
      placement: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-placement-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-placement-embed': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PlacementEmbedView);
  },
});

export default PlacementEmbedNode;
