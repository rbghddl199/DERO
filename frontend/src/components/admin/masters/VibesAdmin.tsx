// 관리자 무드(vibe) 관리 — 이름 한 칸뿐이라 NameMasterAdmin에 배선만 한다.
// 무드명은 부분 유니크(uq_vibe_name)라 중복 등록은 409로 거절된다(erd.md §4 분류 태그).

'use client';

import { createVibe, deleteVibe, listVibes, updateVibe } from '@/api/admin/masters';
import NameMasterAdmin from '@/components/admin/masters/NameMasterAdmin';

const NAME_HELP =
  '제품에 붙일 분위기 이름입니다("미니멀", "우드"). 이미 등록된 이름이면 저장되지 않습니다.';

const VibesAdmin = () => (
  <NameMasterAdmin
    title="무드"
    pageDescription="제품 분위기 태그 마스터입니다. 사용자가 취향으로 제품을 좁힐 때 쓰입니다."
    nameHelp={NAME_HELP}
    hasDescription={false}
    list={listVibes}
    create={(values) => createVibe({ name: values.name })}
    update={(id, values) => updateVibe(id, { name: values.name })}
    remove={deleteVibe}
  />
);

export default VibesAdmin;
