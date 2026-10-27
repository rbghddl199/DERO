// 멘션 자동완성 드롭다운 — 후보를 그리기만 한다. 위치 지정(absolute 부모)과 키보드 이벤트는
// 입력기마다 달라서 호출부가 소유한다.
'use client';

import PersonAvatar from '@/components/common/PersonAvatar';
import type { UserSearchResultResponse } from '@/types/user';

type Props = {
  candidates: readonly UserSearchResultResponse[];
  activeIndex: number;
  onSelect: (candidate: UserSearchResultResponse) => void;
  /** 503일 때는 "후보 없음"이 아니라 그 사실을 말한다 — 폴백이 없어서다(ADR-0019 결정 6). */
  isUnavailable?: boolean;
};

const MentionSuggestionList = ({
  candidates,
  activeIndex,
  onSelect,
  isUnavailable = false,
}: Props) => {
  if (isUnavailable) {
    return (
      <div className="border-ash/40 bg-paper text-ash rounded-[10px] border px-3 py-2 text-[13px] shadow-lg">
        지금은 닉네임을 찾을 수 없어요. 잠시 후 다시 시도해주세요.
      </div>
    );
  }
  if (candidates.length === 0) return null;

  return (
    <ul className="border-ash/40 bg-paper max-h-[220px] overflow-y-auto rounded-[10px] border py-1 shadow-lg">
      {candidates.map((candidate, index) => (
        <li key={candidate.userId}>
          {/* onMouseDown이다 — onClick이면 입력창이 먼저 blur돼 커서 위치를 잃는다 */}
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(candidate);
            }}
            className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[14px] ${
              index === activeIndex ? 'bg-fog' : ''
            }`}
          >
            <PersonAvatar
              name={candidate.nickname}
              avatarUrl={candidate.profileImageUrl}
              size={22}
            />
            <span className="text-ink truncate">{candidate.nickname}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};

export default MentionSuggestionList;
