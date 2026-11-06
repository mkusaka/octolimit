# octolimit

A dashboard that signs you in with GitHub OAuth and shows your GitHub API rate limits (remaining, limit, reset time). Runs on Cloudflare Workers with Hono, `@hono/inertia`, and TanStack Redact as the client-side React runtime. No database: the token lives in an encrypted cookie.

## Setup

1. Register a GitHub OAuth App (Settings → Developer settings → OAuth Apps).
   - Authorization callback URL: `http://localhost:8787/auth/callback` (production: `https://<your-worker>/auth/callback`)
2. `cp .dev.vars.example .dev.vars` and fill in the values. Generate `AUTH_SECRET` with `openssl rand -base64 32`.
3. `bun install`, then `bun dev`

## Commands

| Command         | Description                         |
| --------------- | ----------------------------------- |
| `bun dev`       | Dev server on http://localhost:8787 |
| `bun test`      | Tests                               |
| `bun check`     | Type check + oxlint + oxfmt --check |
| `bun fmt`       | Format                              |
| `bun run build` | Production build                    |

## Deploy

```sh
bunx wrangler secret put GITHUB_CLIENT_ID
bunx wrangler secret put GITHUB_CLIENT_SECRET
bunx wrangler secret put AUTH_SECRET
bun run deploy
```

With Workers Builds, set the build command to `bun run build` and the deploy command to `bunx wrangler deploy`.
