import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias: {
      '@app/preload': path.resolve(__dirname, '../preload'),
      '@app/renderer': path.resolve(__dirname, '../renderer'),
    },
  },
  resolve: {
    alias: {
      '@app/preload': path.resolve(__dirname, '../preload'),
      '@app/renderer': path.resolve(__dirname, '../renderer'),
    },
  },
});
