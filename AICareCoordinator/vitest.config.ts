import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/shared/**/*.test.ts',
      'packages/backend/**/*.test.ts',
      'packages/frontend/**/*.test.ts',
      'packages/frontend/**/*.test.tsx',
      'infra/**/*.test.ts',
    ],
  },
});
