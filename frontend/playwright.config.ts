import { defineConfig } from '@playwright/test'

// Headless chromium needs software WebGL for WebGPURenderer's WebGL2 fallback.
const SWIFTSHADER_ARGS = [
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--ignore-gpu-blocklist',
]

// 기본 3000. 다른 체크아웃의 dev 서버가 3000을 잡고 있을 때(같은 머신에 워크트리가 여럿
// 있으면 흔하다) 남의 서버를 죽이지 않고 돌리기 위한 탈출구다 — `E2E_PORT=3100 npm run test:e2e`.
const PORT = process.env.E2E_PORT ?? '3000'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    // 시뮬레이터는 Next 라우트 /simulator 아래 — 스펙은 goto('/simulator')로 이동한다.
    // baseURL에 경로를 넣어도 goto('/…')는 절대 경로라 덮어쓰므로 소용없다.
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1600, height: 1000 },
    launchOptions: { args: SWIFTSHADER_ARGS },
  },
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}/simulator`,
    // Deterministic lifecycle: Playwright owns the dev server per run and waits
    // for the URL to actually respond, so partial re-runs never race a prior
    // server's teardown (was ERR_CONNECTION_REFUSED with reuseExistingServer).
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
