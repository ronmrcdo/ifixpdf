import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // a cached transform would freeze the licenses/ glob in About.tsx
    fsModuleCache: false,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules', 'dist'],
  },
});
