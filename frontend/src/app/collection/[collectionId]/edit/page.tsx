// 컬렉션 글 수정 라우트 — 본인 글만 고칠 수 있다(폼이 authorId로 한 번 막고, 서버도 삭제 시
// 403으로 다시 막는다). 데이터 로딩·소유권 확인은 전부 클라이언트에서 한다(제목·설명·태그가
// 서버 필드가 아니라 로컬 사이드카에도 있어 커뮤니티처럼 서버 렌더 메타데이터를 만들 수 없다).
import type { Metadata } from 'next';
import CollectionEditForm from '@/components/collection/CollectionEditForm';

export const metadata: Metadata = {
  title: '컬렉션 수정 — 데스크테리어 시뮬레이터',
};

type Props = {
  params: Promise<{ collectionId: string }>;
};

const CollectionEditPage = async ({ params }: Props) => {
  const { collectionId } = await params;

  return (
    <div className="bg-paper min-h-full">
      <div className="mx-auto max-w-[1200px] px-6 pt-12 pb-24 lg:px-[48px]">
        <CollectionEditForm collectionId={collectionId} />
      </div>
    </div>
  );
};

export default CollectionEditPage;
