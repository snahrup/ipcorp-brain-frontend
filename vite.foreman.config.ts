// Side-by-side preview config for the Foreman Briefing track.
//
// The everyday Workbench runs from the main checkout on 5217 + 8817. This
// worktree holds an unmerged branch, so it gets its own pair of ports and its
// own gateway: nothing here touches the running app or the checkout another
// session is working in. `VITE_GATEWAY_URL: "/api"` makes the browser call
// this dev server's proxy instead of the hard-coded 8817, so the preview
// reaches THIS branch's gateway on 8818.
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_GATEWAY_URL": JSON.stringify("/api"),
  },
  server: {
    port: 5218,
    strictPort: true,
    host: "127.0.0.1",
    // The existing ngrok tunnel for this port, so the branch can be looked at
    // from a phone. Vite rejects an unlisted Host header outright.
    allowedHosts: ["datahub.nahrup.ngrok.app"],
    watch: {
      ignored: [
        "**/*.md",
        "**/.agent-runs/**",
        "**/.frontend-verify/**",
        // THIS worktree's own .claude directory, resolved absolutely. The
        // inherited "**/.claude/**" pattern is fatal here: the worktree itself
        // lives under .claude/worktrees/, so that glob matched every source
        // file in the project and the watcher ignored the entire app. Edits
        // only appeared after a full server restart, which reads like a
        // caching mystery and is really one greedy glob.
        `${here}.claude/**`,
        "**/data/meeting-infographic-audit.json",
        "**/server/**",
      ],
    },
    proxy: {
      "/api": { target: "http://127.0.0.1:8818", changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
