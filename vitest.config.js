import { defineConfig } from 'vitest/config';

// Test runner configuration (unit, UI and engine tests). The app itself is built by Next.js.
// https://vitest.dev/config/
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**', 'scripts/**', 'server/**'],
      reporter: ['text-summary', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'ui',
          include: ['tests/ui/**/*.test.{js,jsx}'],
          environment: 'jsdom',
          setupFiles: ['tests/ui/setup.js'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          include: ['tests/engine/**/*.test.js', 'tests/scripts/**/*.test.js', 'tests/functions/**/*.test.js'],
          environment: 'node',
        },
      },
    ],
  },
});
