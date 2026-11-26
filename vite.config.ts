import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// One config for both the dev server (Vite) and the unit tests (Vitest).
export default defineConfig({
  plugins: [react()],
  test: {
    // The compiler core is plain TypeScript, so tests run in Node: no browser needed.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
