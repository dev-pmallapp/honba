import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        designer: resolve(__dirname, "designer.html"),
        simulator: resolve(__dirname, "simulator.html"),
        stock: resolve(__dirname, "stock.html"),
        options: resolve(__dirname, "options.html"),
        backtest: resolve(__dirname, "backtest.html"),
      },
    },
  },
});
