// 관리자 해시태그 관리 — 이름 + 설명뿐이라 NameMasterAdmin에 배선만 한다.
// 해시태그명은 부분 유니크(uq_hashtag_name)다 — 같은 이름이 두 행으로 갈리면 태그 검색 결과가
// 반으로 쪼개진다(erd.md §4 분류 태그).

'use client';

import { createHashtag, deleteHashtag, listHashtags, updateHashtag } from '@/api/admin/masters';
import NameMasterAdmin from '@/components/admin/masters/NameMasterAdmin';

const NAME_HELP =
  '# 없이 태그 글자만 입력합니다("원목데스크"). 이미 등록된 이름이면 저장되지 않습니다 — 같은 이름이 둘로 갈리면 검색 결과가 쪼개집니다.';
const DESCRIPTION_HELP = '이 태그를 어떤 제품에 붙이는지 한 줄로 적습니다. 비워도 됩니다.';

const HashtagsAdmin = () => (
  <NameMasterAdmin
    title="해시태그"
    pageDescription="제품 탐색용 자유 확장 태그 마스터입니다."
    nameHelp={NAME_HELP}
    hasDescription
    descriptionHelp={DESCRIPTION_HELP}
    list={listHashtags}
    create={(values) => createHashtag({ name: values.name, description: values.description })}
    update={(id, values) =>
      updateHashtag(id, { name: values.name, description: values.description })
    }
    remove={deleteHashtag}
  />
);

export default HashtagsAdmin;
