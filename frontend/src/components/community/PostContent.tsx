// 게시글 본문 렌더러 — 마크다운 원문을 표시하고 `[[placement:ID]]` 토큰 자리에 배치 카드를 끼운다.
// 본문을 토큰으로 split해 짝수 인덱스는 react-markdown, 홀수 인덱스는 PlacementEmbedCard로 번갈아
// 렌더한다(ADR-0013 결정 1). 배치 조회는 여기서 하지 않는다 — 호출부가 extractPlacementIds로 id를
// 모아 `listPlacements({ ids })` 한 번으로 받아 placements 맵을 내려준다(카드마다 fetch 금지).
// react-markdown은 기본적으로 raw HTML을 렌더하지 않는다(escape). 다만 밑줄·글자색·정렬은 마크다운
// 문법으로 표현이 안 돼서(PostRichEditor의 serializeEditorContent 참고) <u>, <span class="text-color-*">,
// <p class="text-align-*"> 형태로 저장된다 — 그래서 rehype-raw로 그 조각만 파싱하고, 반드시
// rehype-sanitize로 richTextClasses.ts에 정의된 class만 허용 목록에 넣어 나머지는 전부 제거한다.
// style 속성은 어떤 태그에도 허용하지 않는다(임의 CSS 삽입 여지 자체를 없앤다).
//
// **iframe이 나가는 자리는 유튜브 임베드 하나뿐이다**(DERO-616) — 본문에 적힌 iframe 태그는
// 위 허용 목록에 없어 sanitize가 지우고, 문단 렌더러가 `utils/youtubeEmbed`로 유튜브 주소만 플레이어로
// 바꾼다(조건은 youTubeEmbedOfSoleLink). 허용 호스트를 넓히면 SSR 공개 페이지에 임의 사이트를 끼울 수
// 있게 되니 거기서 판단할 것.
//
// **본문 이미지의 src는 URL이 아니라 스토리지 key다**(`![책상](post-images/a.png)`). presigned GET URL은
// TTL이 있어(S3 15분) 본문에 박아 저장하면 글이 15분 뒤부터 깨진다 — 그래서 만료 없는 key를 저장하고,
// 렌더 시점에 `PostDetailResponse.images`가 주는 (imageKey → imageUrl) 맵으로 해석한다. 맵에 없으면
// 원문을 그대로 쓴다(과거에 URL로 저장된 글도 그냥 뜬다).
import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { defaultSchema, type Schema } from 'hast-util-sanitize';
import RemoteImage from '@/components/common/RemoteImage';
import type { PlacementSummaryResponse } from '@/types/placement';
import { toYouTubeEmbedUrl } from '@/utils/youtubeEmbed';
import { splitContentByPlacementTokens } from './communityContent';
import PlacementEmbedCard from './PlacementEmbedCard';
import { TEXT_ALIGN_CLASS_NAMES, TEXT_COLOR_CLASS_NAMES } from './richTextClasses';

/**
 * 그 문단이 **자동 링크된 유튜브 주소 하나뿐**일 때의 임베드 주소. 아니면 undefined다.
 *
 * 조건이 둘인 이유가 각각 있다 — **글자와 href가 같아야** 하는 것은 사용자가 문구를 붙인 링크
 * (`[키보드 영상](...)`)는 그 문구가 의도이기 때문이고, **문단의 유일한 자식**이어야 하는 것은
 * Tiptap이 문장 중간의 주소도 자동 링크해서다(그 자리를 플레이어로 바꾸면 16:9 블록이 문장을
 * 가로로 쪼갠다). 그래서 판정이 링크가 아니라 문단 쪽에 있다.
 */
const youTubeEmbedOfSoleLink = (children: ReactNode): string | undefined => {
  const nodes = Children.toArray(children);
  if (nodes.length !== 1) return undefined;
  const only = nodes[0];
  if (!isValidElement<{ href?: unknown; children?: unknown }>(only)) return undefined;
  const { href, children: label } = only.props;
  if (typeof href !== 'string' || label !== href) return undefined;
  return toYouTubeEmbedUrl(href);
};

const sanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'u'],
  attributes: {
    ...defaultSchema.attributes,
    span: [['className', ...TEXT_COLOR_CLASS_NAMES]],
    p: [['className', ...TEXT_ALIGN_CLASS_NAMES]],
  },
};

type RehypePlugins = ComponentProps<typeof Markdown>['rehypePlugins'];
const rehypePlugins: RehypePlugins = [rehypeRaw, [rehypeSanitize, sanitizeSchema]];

const BASE_MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => <h2 className="text-ink mt-6 mb-2 text-[20px] font-medium">{children}</h2>,
  h2: ({ children }) => <h3 className="text-ink mt-5 mb-2 text-[18px] font-medium">{children}</h3>,
  h3: ({ children }) => (
    <h4 className="text-ink mt-4 mb-1.5 text-[16px] font-medium">{children}</h4>
  ),
  p: ({ children, className }) => {
    const embedUrl = youTubeEmbedOfSoleLink(children);
    if (embedUrl !== undefined) {
      return (
        <iframe
          src={embedUrl}
          title="YouTube 동영상"
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="my-3 aspect-video w-full rounded-[10px]"
        />
      );
    }
    return (
      <p className={`text-ink mb-3 text-[15px] leading-[1.7] ${className ?? ''}`}>{children}</p>
    );
  },
  span: ({ children, className }) => <span className={className}>{children}</span>,
  ul: ({ children }) => (
    <ul className="text-ink mb-3 list-disc space-y-1 pl-5 text-[15px] leading-[1.6]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="text-ink mb-3 list-decimal space-y-1 pl-5 text-[15px] leading-[1.6]">
      {children}
    </ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-ash/40 text-ash my-3 border-l-2 pl-4 text-[15px] italic">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => <strong className="font-medium">{children}</strong>,
  code: ({ children }) => (
    <code className="bg-fog rounded px-1 py-0.5 text-[13px]">{children}</code>
  ),
  a: ({ children, href }) => (
    <a href={href} className="text-primary-700 underline underline-offset-2">
      {children}
    </a>
  ),
};

type Props = {
  content: string;
  /** 본문 토큰이 가리키는 배치들. 없는 id는 "삭제된 배치입니다" 플레이스홀더가 된다 */
  placements?: ReadonlyMap<number, PlacementSummaryResponse>;
  /** 본문 이미지의 (imageKey → presigned imageUrl). 없는 key는 원문 src를 그대로 쓴다 */
  imageUrls?: ReadonlyMap<string, string>;
};

const PostContent = ({ content, placements, imageUrls }: Props) => {
  const segments = splitContentByPlacementTokens(content);
  const components: Components = {
    ...BASE_MARKDOWN_COMPONENTS,
    img: ({ src, alt }) => {
      const resolved = typeof src === 'string' ? (imageUrls?.get(src) ?? src) : undefined;
      if (resolved === undefined) return null;
      // 맵이 해석하지 못한 원문은 스토리지 key 그대로일 수 있다 — 브라우저가 상대 경로로 읽어
      // 404가 되던 값이고, next/image는 아예 던진다. 주소 꼴이 아니면 안 그린다.
      if (!/^(https?:\/\/|\/)/.test(resolved)) return null;
      return (
        // 사진이 화면 어디쯤인지 읽어야 하는 호출부(데스크피드 상세의 사진별 제품 레일 —
        // ADR-0039 결정 4)를 위해 **본문에 적힌 src를 DOM에 남긴다**. 문단 안이라 래퍼는
        // `span`이어야 한다(`div`면 파서가 문단을 쪼개 SSR 하이드레이션이 어긋난다).
        <span data-image-key={typeof src === 'string' ? src : undefined} className="block">
          {/* 옛 글은 본문에 만료된 외부 URL이 박혀 있을 수 있다 — remotePatterns 밖 호스트는 최적화가
              400을 내고 RemoteImage가 조용히 지운다(그 URL은 이미 만료돼 어차피 안 뜨던 것들이다). */}
          <RemoteImage
            src={resolved}
            alt={alt ?? ''}
            width={800}
            height={600}
            sizes="(min-width: 768px) 720px, 100vw"
            className="my-3 w-full rounded-[10px]"
          />
        </span>
      );
    },
  };

  return (
    <div className="font-swiss tracking-[-0.03em]">
      {segments.map((segment, index) => {
        if (index % 2 === 1) {
          const placementId = Number(segment);
          return (
            <PlacementEmbedCard
              key={`embed-${index}-${segment}`}
              placementId={placementId}
              placement={placements?.get(placementId)}
            />
          );
        }
        if (segment.trim() === '') return null;
        return (
          <Markdown key={`markdown-${index}`} components={components} rehypePlugins={rehypePlugins}>
            {segment}
          </Markdown>
        );
      })}
    </div>
  );
};

export default PostContent;
