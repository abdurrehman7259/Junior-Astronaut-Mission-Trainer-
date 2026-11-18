import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Local stand-in for the Vercel Function api/donki.ts (D-041), so `npm run dev` and `npm run preview` show the
 * live banner too. The request goes from this local server to NASA, never from the browser.
 */
const donkiDevProxy = {
  '/api/donki': {
    target: 'https://ccmc.gsfc.nasa.gov',
    changeOrigin: true,
    rewrite: (path: string) => {
      const url = new URL(path, 'http://localhost');
      const type = url.searchParams.get('type');
      url.searchParams.delete('type');
      return `/DONKI-API/get/${type === 'FLR' || type === 'CME' ? type : 'invalid'}?${url.searchParams}`;
    },
  },
};

// https://vite.dev/config/  ·  https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: donkiDevProxy },
  preview: { proxy: donkiDevProxy },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**', 'scripts/**'],
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
