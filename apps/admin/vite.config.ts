import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // shared 为 CommonJS，Rollup 无法静态识别 defineProperty 再导出。直接编译源码。
    alias: {
      '@tishuashua/shared': path.resolve(rootDir, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
});
