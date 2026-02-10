import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/e2e/**',
      '**/lib/ai/shared/rag-search.test.ts',
      '**/__tests__/utils/delais-tunisie.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.next/',
        'out/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'scripts/',
        'supabase/',
      ],
      thresholds: {
        lines: 5,
        functions: 10,
        branches: 5,
        statements: 5,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
