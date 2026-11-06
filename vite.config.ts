import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { redact } from "@tanstack/redact/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import ssrPlugin from "vite-ssr-components/plugin";

export default defineConfig({
  // Fixed so the OAuth App callback URL stays valid.
  server: { port: 8787, strictPort: true },
  // The Worker only emits an HTML shell, so Redact replaces React in the browser bundle only.
  plugins: [
    redact({ environments: ["client"] }),
    cloudflare(),
    ssrPlugin(),
    tailwindcss(),
    // VitePWA's top-level `ssr` config spawns an extra "ssr" environment with no entry, which
    // breaks the build; the Worker never imports workbox-window, so that hook is dropped.
    ...VitePWA({
      // There is no index.html to inject into; app/client.tsx registers the worker.
      injectRegister: false,
      registerType: "autoUpdate",
      manifest: {
        name: "octolimit",
        short_name: "octolimit",
        description: "GitHub API rate limit dashboard",
        start_url: "/",
        display: "standalone",
        theme_color: "#18181b",
        background_color: "#18181b",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      // Pages are rendered by the Worker per session, so only static assets are precached.
      workbox: { navigateFallback: null, globPatterns: ["**/*.{js,css,svg}"] },
    }).map((p) => (p.name === "vite-plugin-pwa" ? { ...p, config: undefined } : p)),
  ],
});
