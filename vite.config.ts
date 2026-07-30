import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5217,
    strictPort: true,
    host: "127.0.0.1",
    allowedHosts: ["ip-corp-brain.nahrup.ngrok.app"],
    // Over the tunnel the browser is on a phone, where 127.0.0.1:8817 is the phone
    // itself. Serving the gateway from the same origin is what makes the public URL
    // work at all, and it keeps :8817 unexposed: only this proxy reaches it.
    proxy: {
      "/api": { target: "http://127.0.0.1:8817", changeOrigin: true },
    },
  },
  preview: {
    port: 5217,
    strictPort: true,
    host: "127.0.0.1",
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
