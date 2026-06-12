import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['docs/harness/**', 'node_modules/**', 'dist/**'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Pure-logic modules: target 80% per plan. DOM-heavy rendering,
      // interceptor (MAIN-world), and orchestration code are exercised by
      // manual + cross-browser smoke testing (Phase H), not unit tests.
      include: [
        'src/overlay/util.ts',
        'src/overlay/state.ts',
        'src/overlay/entries.ts',
        'src/overlay/rules/matching.ts',
      ],
      exclude: ['src/**/*.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
