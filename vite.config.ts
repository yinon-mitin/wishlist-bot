import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: { outDir: 'dist/web', emptyOutDir: true, target: 'es2020' },
  server: { proxy: { '/api': 'http://localhost:8080', '/images': 'http://localhost:8080' } },
});
