// 평문 안 멘션 토큰(`[[user:ID]]`)을 프로필 링크로 그린다 — 마크다운을 거치지 않는 자리 전용이다.
// 지금 쓰는 곳은 데스크피드 댓글 하나뿐이다: 댓글은 마크다운이 아니라 평문이라 본문처럼
// `resolveMentions`로 마크다운 링크를 만들어 넘길 수 없다(사용자가 친 `*`가 기울임이 돼 버린다).
// 토큰 문법·폴백 문구는 본문과 같은 곳(communityContent.ts)에서 온다 — 규칙이 두 벌이 되지 않게.
import Link from 'next/link';
import type { DeskFeedMentionResponse } from '@/types/deskFeed';
import {
  UNKNOWN_MENTION_LABEL,
  splitContentByMentionTokens,
  userProfileHref,
} from './communityContent';

type Props = {
  content: string;
  /**
   * 서버가 푼 해석표. **없는 id는 "@알 수 없음" 평문**이다(탈퇴·부재 — ADR-0038 결정 4).
   *
   * 배포 롤링 중(멘션 이전 백엔드)엔 필드 자체가 없을 수 있어 선택이다 — `resolveMentions`와 같은
   * 이유이고, 없으면 상세 화면이 통째로 빈다.
   */
  mentions?: readonly DeskFeedMentionResponse[];
};

const MentionText = ({ content, mentions = [] }: Props) => {
  const byId = new Map(mentions.map((mention) => [mention.userId, mention.nickname]));

  return (
    <>
      {splitContentByMentionTokens(content).map((segment, index) => {
        if (index % 2 === 0) return segment;

        const userId = Number(segment);
        const nickname = byId.get(userId);
        if (nickname === undefined) {
          return <span key={`mention-${index}`}>{UNKNOWN_MENTION_LABEL}</span>;
        }
        return (
          <Link
            key={`mention-${index}`}
            href={userProfileHref(userId)}
            className="text-primary-700 hover:underline"
          >
            @{nickname}
          </Link>
        );
      })}
    </>
  );
};

export default MentionText;
