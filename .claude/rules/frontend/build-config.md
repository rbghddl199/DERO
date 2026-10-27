---
paths:
  - "**/frontend/package.json"
  - "**/frontend/package-lock.json"
  - "**/frontend/tsconfig.json"
  - "**/frontend/next.config.ts"
  - "**/frontend/Dockerfile"
  - "**/frontend/next-env.d.ts"
  - "**/frontend/src/types/openapi.d.ts"
  - "**/.vscode/settings.json"
---

# frontend — build / dependency / toolchain traps

Output language: Korean.

Full narrative behind the one-line rules in `frontend/CLAUDE.md`.
(Over 300 words on purpose: 6 independent toolchain traps — each fires in a different file
(`tsconfig`, `package.json`, `next.config.ts`, `Dockerfile`) and each reads as "the build is
broken", not as a rule violation.)

## Phantom `TS2307` on a fresh checkout

On a fresh checkout `npm run typecheck` reports ~32 phantom `TS2307: Cannot find module '@/assets/...'`
errors — run `npm run build` (or `dev`) once first. `next-env.d.ts` is generated, not committed, and it is
what pulls in `next/image-types/global` (the `*.svg`/`*.png` module declarations); without it every
static-asset import fails to resolve even though the files are right there on disk. Do not "fix" it by
adding a declaration file (2026-08-05).

## typecheck memory

typecheck requires `--max-old-space-size=4096` — TSL type inference eats memory (tsc OOM precedent). If
`next build`'s own typecheck OOMs, give it the same limit via `NODE_OPTIONS`.

**QA scratch files left as `.ts` break typecheck** — `qa-artifacts/` is gitignored but still inside the
tsconfig include, so you get phantom module resolution errors; use `.mjs`/`.txt` (2026-07-25).

## Dependency pins

`@react-three/fiber` 9.6.1's peer is `react >=19 <19.3` — leaving react/react-dom at `^19` or `latest`
breaks silently when 19.3 ships. Pin `19.2.x` (2026-07-22, verified with `npm view`).

The `three` package itself ships no `.d.ts` — types come from `@types/three`; if that goes missing the
entire simulator source becomes unchecked, so never paper over it with `ignoreBuildErrors`.

## `src/types/openapi.d.ts` is generated

Do not hand-edit (ADR-0008); regenerate with `npm run api:types`, which **requires the backend running on
the `local` profile** (springdoc is only exposed there — otherwise it just dies on a failed fetch). A
backend API contract change means regenerating as part of the change (2026-07-31).

## `output: 'standalone'` Docker artifacts

Standalone artifacts do not include `public/` or `.next/static` — without separate `COPY` steps in the
Dockerfile every GLB and image 404s. The standalone server also binds to localhost by default, so without
`ENV HOSTNAME=0.0.0.0` container port mapping is meaningless, and the build stage needs
`NODE_OPTIONS=--max-old-space-size=4096` (same cause as the typecheck trap above) (2026-07-27
DERO-173, measured on image build and startup).

**런타임 캐시 디렉터리도 같이 만들어야 한다.** `COPY --from=build`는 전부 root 소유로 떨어지는데
런타임은 `USER dero`다. `.next/cache`를 미리 만들어 소유권을 넘기지 않으면 next/image 최적화와
prerender가 `EACCES: permission denied, mkdir '/app/.next/cache'`로 죽는다 — 페이지는 뜨지만
**캐시가 통째로 없는 상태로 돈다.** 같은 이미지를 매 요청 다시 디코딩·인코딩하므로 원격 이미지가
전부 next/image를 타는 지금은(ADR-0035 결정 5) 그 비용이 EC2 CPU를 직접 문다. `USER` 전에
`RUN mkdir -p /app/.next/cache && chown dero:dero /app/.next/cache` (2026-08-11 운영 로그 실측,
DERO-587). 캐시는 컨테이너 안에 있어 배포마다 비는데, 그건 정상이다 — 다시 덥혀진다.

## VSCode workspace root

When the VSCode workspace root is the repo root (`DERO`), `frontend/.vscode/settings.json` is not
loaded — put editor settings in the root `.vscode/` and point `eslint.workingDirectories` at `frontend`.

Turbopack dev-cache recovery after a dependency-changing merge, and the fate of `frontend/assets-raw/`,
moved to `docs/context/asset-pipeline.md` ("원본 에셋·빌드 운영 기록", 2026-08-14).
