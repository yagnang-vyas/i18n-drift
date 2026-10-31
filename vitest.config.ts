import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // src/cli.ts is a three-line process entry point that is exercised by the
      // spawned-process tests; types.ts contains only type declarations.
      exclude: ['src/cli.ts', 'src/types.ts'],
      reporter: ['text-summary', 'text', 'lcov'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
