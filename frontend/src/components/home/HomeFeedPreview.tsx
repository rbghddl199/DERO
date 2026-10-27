// 홈 랜딩 컬렉션 미리보기 — /collection에 공개된 배치 중 일부를 링크 전용 카드로 보여준다.
// CollectionCard(북마크 토글 포함)는 재사용하지 않는다 — home은 도메인 로직·전역 상태를 갖지 않는다는
// home/CLAUDE.md 원칙에 따라 여기선 클릭하면 /collection/{id}로 이동하는 것뿐이다. 표지 이미지만은
// CollectionCoverImage를 그대로 쓴다 — presigned URL 처리·404 폴백 로직을 새로 베끼지 않기 위해서다.
import Link from 'next/link';
import CollectionCoverImage from '@/components/collection/CollectionCoverImage';
import type { CollectionPost } from '@/components/collection/types';

type Props = {
  posts: CollectionPost[];
};

const HomeFeedPreview = ({ posts }: Props) => {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
      {posts.map((post) => (
        <Link
          key={post.id}
          href={`/collection/${post.id}`}
          className="focus-visible:outline-primary-600 group relative block aspect-[4/5] overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <CollectionCoverImage
            post={post}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="transition-transform duration-500 ease-out group-hover:scale-105"
          />
          <div className="from-ink/80 pointer-events-none absolute inset-0 bg-gradient-to-t via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="text-paper absolute inset-x-0 bottom-0 translate-y-2 p-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <p className="truncate text-[15px] font-medium">{post.title}</p>
            <p className="text-paper/80 mt-0.5 truncate text-[13px]">{post.author}</p>
          </div>
        </Link>
      ))}
    </div>
  );
};

export default HomeFeedPreview;
