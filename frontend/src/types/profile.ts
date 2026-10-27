// 마이페이지 프로필 조회 값과 메모리 전용 수정 draft 상태를 정의한다.

export interface ProfileInfo {
  nickname: string;
  email: string;
  avatarUrl: string | null;
  introduction: string;
  joinedAt: string;
}

export interface ProfileDraft {
  nickname: string;
  introduction: string;
}

export type ProfileEditorState =
  | {
      mode: 'view';
      profile: ProfileInfo;
      draft: null;
    }
  | {
      mode: 'edit';
      profile: ProfileInfo;
      draft: ProfileDraft;
    };

export type ProfileEditorAction =
  | { type: 'start-editing' }
  | { type: 'change-nickname'; value: string }
  | { type: 'change-introduction'; value: string }
  | { type: 'cancel-editing' };

export function createProfileEditorState(profile: ProfileInfo): ProfileEditorState {
  return {
    mode: 'view',
    profile,
    draft: null,
  };
}

export function profileEditorReducer(
  state: ProfileEditorState,
  action: ProfileEditorAction,
): ProfileEditorState {
  if (action.type === 'start-editing') {
    return {
      mode: 'edit',
      profile: state.profile,
      draft: {
        nickname: state.profile.nickname,
        introduction: state.profile.introduction,
      },
    };
  }

  if (action.type === 'cancel-editing') {
    return {
      mode: 'view',
      profile: state.profile,
      draft: null,
    };
  }

  if (state.mode !== 'edit') {
    return state;
  }

  if (action.type === 'change-nickname') {
    return {
      ...state,
      draft: {
        ...state.draft,
        nickname: action.value,
      },
    };
  }

  return {
    ...state,
    draft: {
      ...state.draft,
      introduction: action.value,
    },
  };
}
