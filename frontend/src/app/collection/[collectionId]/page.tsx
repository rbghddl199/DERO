// 컬렉션 상세 라우트 — id로 글을 찾아 렌더링하고, 서버가 안 주면 CollectionDetailGate가 404 처리한다.
import type { Metadata } from 'next';
import { getCollectionPost } from '@/api/collection';
import CollectionDetailGate from '@/components/collection/CollectionDetailGate';
import { safeMypageReturnTo, type ReturnToQueryValue } from '@/utils/mypageReturnTo';

type Props = {
  params: Promise<{ collectionId: string }>;
  searchParams: Promise<{ returnTo?: ReturnToQueryValue }>;
};

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { collectionId } = await params;
  const post = await getCollectionPost(collectionId).catch(() => undefined);

  if (!post) {
    // 아직 PUBLIC이 아니거나 없는 배치다 — 제목을 지어내지 않는다.
    return { title: '컬렉션 — 데스크테리어 시뮬레이터' };
  }

  return {
    title: `${post.title} — 데스크테리어 시뮬레이터`,
    description: post.description,
  };
};

const CollectionDetailPage = async ({ params, searchParams }: Props) => {
  const { collectionId } = await params;
  const { returnTo } = await searchParams;
  const post = await getCollectionPost(collectionId).catch(() => undefined);

  return (
    <CollectionDetailGate
      initialPost={post ?? null}
      returnHref={safeMypageReturnTo(returnTo, 'bookmark')}
    />
  );
};

export default CollectionDetailPage;
