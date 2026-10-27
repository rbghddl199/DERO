// Tiptap 커스텀 **인라인 atom** 노드 — 에디터 안에서 멘션을 `@닉네임` 칩으로 보여준다.
// 저장 시엔 serializeEditorContent가 다시 `[[user:ID]]` 토큰 문자열로 되돌린다(D35·ADR-0038 결정 1)
// — 저장 포맷은 여전히 토큰이고 노드는 에디터 표현 계층일 뿐이다(placementEmbedNode와 같은 관계).
//
// **배치 임베드와 달리 inline이다.** 멘션은 문장 중간에 박히므로 block 노드로 만들면 문단이 갈린다.
// atom인 것은 같다 — 안쪽 글자를 손으로 고치면 id와 표시가 어긋나므로 통째로 지우거나 두거나다.
//
// nickname은 **삽입 시점의 스냅샷**이다(placementEmbed의 placement와 같은 성격) — 저장 문자열엔
// id만 들어가고, 읽는 쪽은 서버가 준 현재 닉네임으로 다시 그린다. 그래서 닉변에 안전하다.
import { mergeAttributes, Node } from '@tiptap/core';
import { UNKNOWN_MENTION_LABEL } from './communityContent';

export const MentionNode = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      userId: { default: null },
      nickname: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-mention]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-mention': '',
        class: 'text-primary-700 rounded bg-fog px-1',
      }),
      // 스냅샷이 없는 토큰(탈퇴·부재, 또는 해석표를 못 받은 경우)은 화면 폴백과 같은 문구를 쓴다.
      typeof node.attrs.nickname === 'string' ? `@${node.attrs.nickname}` : UNKNOWN_MENTION_LABEL,
    ];
  },
});

export default MentionNode;
