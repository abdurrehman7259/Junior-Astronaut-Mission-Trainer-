import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/  ·  https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**', 'scripts/**', 'netlify/**'],
      reporter: ['text-summary', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'ui',
          include: ['tests/ui/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['tests/ui/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          include: [
            'tests/engine/**/*.test.ts',
            'tests/scripts/**/*.test.ts',
            'tests/functions/**/*.test.ts',
          ],
          environment: 'node',
        },
      },
    ],
  },
});
