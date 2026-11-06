/** @jsxImportSource hono/jsx */
import { serializePage, type RootView } from "@hono/inertia";
import { Link, Script, ViteClient } from "vite-ssr-components/hono";

const head = (
  <>
    <ViteClient />
    <Link rel="stylesheet" href="/app/styles.css" />
    <Script src="/app/client.tsx" />
  </>
).toString();

export const rootView: RootView = (page) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>octolimit</title>
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#18181b" />
    ${head}
  </head>
  <body>
    <script data-page="app" type="application/json">${serializePage(page)}</script>
    <div id="app"></div>
  </body>
</html>`;
