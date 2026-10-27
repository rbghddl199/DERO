# syntax=docker/dockerfile:1

# Next.js standalone 실행 이미지. next.config.ts의 output: 'standalone'이 전제다.
FROM node:22-alpine AS build
WORKDIR /app

# next/image가 쓰는 sharp가 alpine에서 요구한다.
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# next build의 타입체크가 TSL 타입 추론에서 메모리를 폭식한다 — frontend/CLAUDE.md "빌드·의존성 함정".
ENV NODE_OPTIONS=--max-old-space-size=4096

# NEXT_PUBLIC_* 는 런타임 env가 아니라 **빌드 타임에 번들 문자열로 인라인**된다 — compose의
# `environment:`에 넣어도 안 먹으므로 반드시 빌드 인자로 받아야 한다(ADR-0005 결정 12).
# 값을 안 주면 src/constants/api.ts의 기본값 http://localhost:8080 이 박히는데, 그건 배포된
# 페이지에서 **사용자 자기 PC**를 가리켜 모든 API 호출이 죽는다. 운영 값은 compose.yaml이 준다.
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
# API_MODE도 같은 이유로 빌드 인자다. 안 주면 src/constants/api.ts 기본값 'mock'이 박혀
# 시뮬레이터가 로컬 목업 카탈로그 id로 저장을 쏘고, prod DB에 없는 id라 전부 400이다
# (2026-08-01 실측 — PLACEMENT_UNKNOWN_PRODUCT). 운영 값 'real'은 compose.yaml이 준다.
ARG NEXT_PUBLIC_API_MODE=""
ENV NEXT_PUBLIC_API_MODE=$NEXT_PUBLIC_API_MODE
# GA4 Measurement ID — 값이 없으면 src/constants/analytics.ts 기본값 ''이 박혀 GA 스크립트
# 자체가 뜨지 않는다(비밀값 아님, 클라이언트에 어차피 노출). 운영 값은 compose.yaml이 준다.
ARG NEXT_PUBLIC_GA_ID=""
ENV NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat
RUN addgroup -S dero && adduser -S -G dero dero

# standalone 산출물엔 public/·.next/static이 빠져 있다. 빠뜨리면 에셋이 전부 404다.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/public ./public
COPY --from=build /app/.next/static ./.next/static

# next/image 최적화 결과와 prerender 결과가 런타임에 `.next/cache`에 쌓인다. 위 COPY는 전부 root
# 소유로 떨어지므로 이 디렉터리를 미리 만들어 dero에게 넘기지 않으면 `EACCES: mkdir` 이 나고
# **캐시가 통째로 죽는다** — 같은 이미지를 매 요청 다시 디코딩·인코딩하게 되고, 원격 이미지가
# 전부 next/image를 타면서(ADR-0035 결정 5) 그 비용이 EC2 CPU를 직접 문다(2026-08-11 운영 실측).
RUN mkdir -p /app/.next/cache && chown dero:dero /app/.next/cache

USER dero

# 기본값은 localhost 바인딩이라 컨테이너 밖에서 닿지 않는다.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
