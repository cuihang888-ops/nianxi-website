import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    proxy: {
      "/anheli-live": {
        target: "http://127.0.0.1:4107",
        ws: true,
        rewrite: path => path.replace(/^\/anheli-live/, ""),
      },
    },
  },
  preview: {
    proxy: {
      "/anheli-live": {
        target: "http://127.0.0.1:4107",
        ws: true,
        rewrite: path => path.replace(/^\/anheli-live/, ""),
      },
    },
  },
  build: { target: "es2022", outDir: "dist", sourcemap: false },
});
