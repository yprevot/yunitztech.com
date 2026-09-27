import { defineConfig } from "astro/config";
import node from "@astrojs/node";
export default defineConfig({
  vite: {
    build: { assetsInlineLimit: 0 },
    server: { allowedHosts: true },
  },
  devToolbar: { enabled: false },
  output: "server",
  adapter: node({ mode: "standalone" }),
  server: { port: 4321 },
  security: { checkOrigin: true },
});
