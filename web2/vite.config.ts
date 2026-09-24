import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  server: {
    port: 5174,
    open: false,
    host: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        workbench: resolve(__dirname, 'workbench.html'),
        algodesigner: resolve(__dirname, 'algodesigner.html'),
        simulator: resolve(__dirname, 'simulator.html'),
        researcher: resolve(__dirname, 'researcher.html'),
      },
    },
  },
});
