import { defineConfig } from '@playwright/test'

// E2E against the real binary: `make studio` must have built bin/studio
// (make studio-check does that first). Global setup builds workspace
// templates with synthesized cohorts; e2e/harness.ts serves a temp copy
// per worker or per test on a free port, so there is no webServer here.
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  outputDir: '../../.playwright/studio-results',
  reporter: 'list',
  // A failed test keeps its trace (and screenshot) under outputDir.
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
})
