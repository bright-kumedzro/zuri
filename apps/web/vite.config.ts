import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  server: { port: 5180 },
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, "index.html"), docs: resolve(import.meta.dirname, "docs.html"), lab: resolve(import.meta.dirname, "lab.html") },
    },
  },
});
