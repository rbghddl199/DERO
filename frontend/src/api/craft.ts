// 내 데스크테리어 목록 조회 — listPlacements(api/placement.ts)를 DeskProject로 매핑
import { listPlacements } from './placement';
import type { DeskProject } from '@/types/craft';

// 목록에 더 보기 UI가 없어 서버가 허용하는 최대치를 한 번에 받는다(ADR-0008 결정 5, 최대 100).
const LIST_SIZE = 100;

export async function getDeskProjects(): Promise<DeskProject[]> {
  // owner=me가 없으면 선택적 인증이 걸린 목록이 "공개된 것 전부 + 내 것"을 돌려준다 — 화면은
  // "내 데스크테리어"라고 말하는데 남의 공개 배치가 섞이고, 에러가 안 나서 개수 말고는 증상이 없다.
  const page = await listPlacements({ owner: 'me', size: LIST_SIZE });

  return page.content.map((placement) => ({
    id: String(placement.id),
    name: placement.title,
    // 백엔드가 내려주는 presigned GET URL을 그대로 쓴다 — 옛 `GET /placements/{id}/thumbnail`
    // (바이트 반환)은 없어졌다(api-spec.md §11, 파일 서빙 엔드포인트를 만들지 않는다).
    // key가 결정론적이라 아직 안 찍은 배치도 URL은 오고, 그 URL이 404면 DeskProjectCard의
    // onError가 폴백한다 — truthy 여부만 보면 안 되는 이유가 그대로 남아 있다.
    thumbnailUrl: placement.thumbnailUrl,
    updatedAt: placement.updatedAt ?? placement.createdAt,
    budgetKrw: placement.budgetKrw ?? 0,
    publishStatus: placement.publishStatus,
    // 목록 응답(PlacementSummaryResponse)엔 배치 아이템이 없다 — 제품 id를 알려면 배치마다
    // GET /placements/{id}를 쳐야 하고, 목록이 최대 100건이라 N+1이 된다. 이 값을 실제로
    // 쓰는 곳은 커뮤니티 업로드 모달 하나뿐이고(UploadDeskModal.tsx:133) 거기서 `?? []`로
    // 받으므로, 빈 배열이면 "사용 제품 0개"로 표시된다. 목록 API가 아이템 id를 실어주면 채운다.
    usedProductIds: [],
  }));
}
