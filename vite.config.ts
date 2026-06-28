import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 4173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        // Standalone 形成性评价中心原型 —— 独立于游戏正统软件，作为申报前瞻性素材。
        assess: 'assess.html',
      },
    },
  },
});
