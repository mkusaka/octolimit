import { inertia } from "@hono/inertia";
import { useSession } from "@hono/session";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { fetchRateLimits, GitHubUnauthorizedError } from "./github";
import { rootView } from "./root-view";

type Bindings = {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  AUTH_SECRET: string;
};

type SessionData = {
  oauth?: { state: string; verifier: string };
  token?: string;
};

const LOGIN_ERRORS: Record<string, string> = {
  state: "Could not verify the sign-in request. Please sign in again.",
  denied: "Authorization on GitHub was cancelled.",
  exchange: "Could not obtain a token from GitHub. Please sign in again.",
  expired: "Your GitHub authorization has expired. Please sign in again.",
};

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

const app = new Hono<{ Bindings: Bindings }>()
  .use(csrf())
  .use(
    useSession<SessionData>({
      duration: { absolute: 60 * 60 * 24 * 7, inactivity: 60 * 60 * 24 },
      setCookie: (c, name, value, opt) => setCookie(c, name, value, { ...opt, secure: true }),
      deleteCookie: (c, name, opt) => deleteCookie(c, name, { ...opt, secure: true }),
    }),
  )
  .use(inertia({ rootView }));

app.get("/", async (c) => {
  const session = await c.var.session.get();
  if (session?.token) return c.redirect("/dashboard");
  return c.render("Login", { error: LOGIN_ERRORS[c.req.query("error") ?? ""] ?? null });
});

app.get("/auth/github", async (c) => {
  const state = randomToken();
  const verifier = randomToken();
  await c.var.session.update({ oauth: { state, verifier } });
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    redirect_uri: new URL("/auth/callback", c.req.url).href,
    state,
    code_challenge: await s256(verifier),
    code_challenge_method: "S256",
    allow_signup: "false",
  }).toString();
  return c.redirect(url.href);
});

app.get("/auth/callback", async (c) => {
  const oauth = (await c.var.session.get())?.oauth;
  const { code, state, error } = c.req.query();
  // The one-time OAuth values are discarded whatever the outcome.
  c.var.session.delete();
  if (!oauth || !state || state !== oauth.state) return c.redirect("/?error=state");
  if (error || !code) return c.redirect("/?error=denied");

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "octolimit",
    },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: new URL("/auth/callback", c.req.url).href,
      code_verifier: oauth.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  // GitHub answers 200 with `{ error }` on failure, so check the body too.
  const body = (await res?.json().catch(() => null)) as { access_token?: string } | null;
  if (!res?.ok || !body?.access_token) return c.redirect("/?error=exchange");

  await c.var.session.update({ token: body.access_token });
  return c.redirect("/dashboard");
});

app.post("/logout", (c) => {
  c.var.session.delete();
  return c.redirect("/", 303);
});

app.get("/dashboard", async (c) => {
  const token = (await c.var.session.get())?.token;
  if (!token) return c.redirect("/");
  // Re-issue the cookie so the inactivity window slides (capped by `absolute`).
  await c.var.session.update((d) => d!);
  try {
    // Lazy prop: GitHub is only called when `limits` is part of the (partial) reload.
    return await c.render("Dashboard", { limits: () => fetchRateLimits(token) });
  } catch (e) {
    if (!(e instanceof GitHubUnauthorizedError)) throw e;
    c.var.session.delete();
    return c.redirect("/?error=expired");
  }
});

export default app;
