import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The build lands in studio/web/dist, which studio/web/embed.go embeds into
// the Go binary. Only dist/.gitkeep is committed (go:embed needs the
// directory to exist on a fresh checkout); restore it after Vite empties
// the output directory.
const outDir = resolve(import.meta.dirname, '../web/dist')

function keepPlaceholder(): Plugin {
  return {
    name: 'studio-keep-placeholder',
    apply: 'build',
    closeBundle() {
      writeFileSync(resolve(outDir, '.gitkeep'), '')
    },
  }
}

export default defineConfig({
  plugins: [react(), keepPlaceholder()],
  build: { outDir, emptyOutDir: true },
  server: {
    // `npm run dev` proxies the API to a running `bin/studio <dir>`.
    proxy: { '/api': 'http://127.0.0.1:4317' },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
