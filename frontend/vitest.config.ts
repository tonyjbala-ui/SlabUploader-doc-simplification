import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.ts'],
    reporters: ['verbose'],
    environment: 'node'
  },
  resolve: {
    alias: { $lib: path.resolve('./src/lib') }
  }
});
