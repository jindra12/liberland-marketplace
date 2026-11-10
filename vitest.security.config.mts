import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// These units must never load the integration setup's live RPC/database probes.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    server: { deps: { inline: ['payload-auth', 'guarded-fetch'] } },
    environment: 'node',
    include: [
      'tests/unit/security-regressions/**/*.spec.ts',
      'tests/integration/security-regressions/**/*.spec.ts',
    ],
    setupFiles: [],
    restoreMocks: true,
    fileParallelism: false,
  },
})
