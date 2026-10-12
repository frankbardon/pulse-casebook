import { defineConfig } from '@playwright/test'

// Smoke test against the real binary: `make studio` must have built
// bin/studio (make studio-check does that first).
const port = 4399

export default defineConfig({
  testDir: 'e2e',
  outputDir: '../../.playwright/studio-results',
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `../../bin/studio ../../showcase/ab-test-readout --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
