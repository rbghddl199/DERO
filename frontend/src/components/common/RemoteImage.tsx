'use client';
// 서버가 주는 안정 공개 이미지 URL(`/api/v1/images/{key}`)을 그리는 유일한 입구 — 원격 이미지는
// 전부 이걸 거친다(ADR-0035 결정 5, DERO-572). 호스트가 환경마다 둘로 고정되면서
// next.config.ts의 remotePatterns 등록이 가능해져 맨 <img>를 next/image로 바꿨다.
//
// 로드 실패를 직접 감지해 fallback으로 갈아끼운다: placement 썸네일처럼 key가 결정론적인 자리는
// URL이 "있음"으로 와도 아직 캡처 안 한 배치는 404라 truthy 여부로 판단할 수 없다
// (craft/CLAUDE.md의 같은 함정). fallback을 안 주면 실패 시 아무것도 그리지 않는다.
//
// blob:/data: 미리보기, 번들 정적 에셋(StaticImageData), SVG 아이콘은 대상이 아니다 — 각각
// 업로드 폼과 next/image 정적 import가 이미 맡고 있다.

import Image, { type ImageProps } from 'next/image';
import { useState, type ReactNode } from 'react';

type Props = ImageProps & {
  /** 로드 실패 시 대신 그릴 것. 생략하면 아무것도 안 그린다 */
  fallback?: ReactNode;
};

const RemoteImage = ({ fallback = null, ...imageProps }: Props) => {
  // src 자체를 기억한다 — 갤러리처럼 한 자리에서 src가 바뀌는 화면은 실패 플래그가 남으면
  // 멀쩡한 다음 이미지까지 폴백으로 삼킨다.
  const [failedSrc, setFailedSrc] = useState<ImageProps['src'] | null>(null);

  if (failedSrc === imageProps.src) return <>{fallback}</>;

  // eslint-disable-next-line jsx-a11y/alt-text -- alt은 스프레드로 들어온다(ImageProps가 타입으로 강제)
  return <Image {...imageProps} onError={() => setFailedSrc(imageProps.src)} />;
};

export default RemoteImage;
