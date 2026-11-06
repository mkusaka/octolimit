import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { redact } from "@tanstack/redact/vite";
import { defineConfig } from "vite";
import ssrPlugin from "vite-ssr-components/plugin";

export default defineConfig({
  // Fixed so the OAuth App callback URL stays valid.
  server: { port: 8787, strictPort: true },
  // The Worker only emits an HTML shell, so Redact replaces React in the browser bundle only.
  plugins: [redact({ environments: ["client"] }), cloudflare(), ssrPlugin(), tailwindcss()],
});
