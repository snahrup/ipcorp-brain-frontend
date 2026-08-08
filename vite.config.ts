import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5217,
    strictPort: true,
    host: "127.0.0.1",
    allowedHosts: ["ip-corp-brain.nahrup.ngrok.app"],
    // Files written while the app is running must never reach the watcher. Tailwind
    // v4 registers every non-ignored file as a CSS dependency, so one write forces a
    // full page reload that throws away whatever was on screen, including the run
    // that caused the write. SESSION-JOURNAL.md is appended by the session hooks the
    // moment a Workbench-dispatched run starts or ends, which is how starting a Jira
    // reconciliation rebooted the page back to the landing view (server log:
    // "page reload SESSION-JOURNAL.md"). The other entries are the run-state lanes
    // already excluded from git for the same reason.
    watch: {
      ignored: [
        "**/SESSION-JOURNAL.md",
        "**/.agent-runs/**",
        "**/.frontend-verify/**",
        "**/.claude/**",
      ],
    },
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
