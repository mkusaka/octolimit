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
    ${head}
  </head>
  <body>
    <script data-page="app" type="application/json">${serializePage(page)}</script>
    <div id="app"></div>
  </body>
</html>`;
