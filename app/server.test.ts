import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { normalizeRateLimits } from "./github";
import app, { s256 } from "./server";

const ENV = {
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
  AUTH_SECRET: "test-secret-test-secret-test-secret",
};
// @hono/session reads AUTH_SECRET via hono/adapter env(), which is Bun.env under bun test (c.env on Workers).
process.env.AUTH_SECRET = ENV.AUTH_SECRET;
const TOKEN = "gho_supersecrettoken123";
const RATE_LIMIT = {
  resources: {
    graphql: { limit: 5000, used: 10, remaining: 4990, reset: 2000000000 },
    core: { limit: 5000, used: 100, remaining: 4900, reset: 2000000000 },
    code_scanning_upload: { limit: 0, used: 0, remaining: 0, reset: 2000000000 },
    search: { limit: 30, used: 1, remaining: 29, reset: 2000000000 },
  },
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  setSystemTime();
});

type Call = { url: string; init?: RequestInit };
function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return calls;
}

const sidOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith("sid="))
    ?.split(";")[0];

const request = (path: string, cookie?: string, headers: Record<string, string> = {}) =>
  app.request(path, { headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers } }, ENV);

async function startLogin() {
  const res = await request("/auth/github");
  const location = new URL(res.headers.get("location")!);
  return { res, location, cookie: sidOf(res)! };
}

async function login(): Promise<string> {
  const { location, cookie } = await startLogin();
  mockFetch(() => Response.json({ access_token: TOKEN, token_type: "bearer" }));
  const res = await request(
    `/auth/callback?code=abc&state=${location.searchParams.get("state")}`,
    cookie,
  );
  expect(res.headers.get("location")).toBe("/dashboard");
  return sidOf(res)!;
}

describe("OAuth", () => {
  test("/auth/github redirects with state and an S256 challenge, and sets a hardened cookie", async () => {
    const { res, location } = await startLogin();
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("scope")).toBeNull();
    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith("sid="))!;
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=");
  });

  test("callback sends the code_verifier matching the challenge and stores the session", async () => {
    const { location, cookie } = await startLogin();
    const calls = mockFetch(() => Response.json({ access_token: TOKEN }));
    const res = await request(
      `/auth/callback?code=abc&state=${location.searchParams.get("state")}`,
      cookie,
    );
    expect(res.headers.get("location")).toBe("/dashboard");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(await s256(body.code_verifier)).toBe(location.searchParams.get("code_challenge")!);
    expect(body.code).toBe("abc");
  });

  test("state mismatch is rejected without exchanging the code", async () => {
    const { cookie } = await startLogin();
    const calls = mockFetch(() => Response.json({ access_token: TOKEN }));
    const res = await request("/auth/callback?code=abc&state=forged", cookie);
    expect(res.headers.get("location")).toBe("/?error=state");
    expect(calls).toHaveLength(0);
  });

  test("callback without a pending OAuth session is rejected", async () => {
    const res = await request("/auth/callback?code=abc&state=anything");
    expect(res.headers.get("location")).toBe("/?error=state");
  });

  test("a token endpoint error body (HTTP 200) is treated as failure, e.g. PKCE mismatch", async () => {
    const { location, cookie } = await startLogin();
    mockFetch(() => Response.json({ error: "bad_verification_code" }));
    const res = await request(
      `/auth/callback?code=abc&state=${location.searchParams.get("state")}`,
      cookie,
    );
    expect(res.headers.get("location")).toBe("/?error=exchange");
    expect((await request("/dashboard", sidOf(res))).headers.get("location")).toBe("/");
  });

  test("the OAuth state cannot be replayed", async () => {
    const { location, cookie } = await startLogin();
    mockFetch(() => Response.json({ error: "bad_verification_code" }));
    const first = await request(
      `/auth/callback?code=abc&state=${location.searchParams.get("state")}`,
      cookie,
    );
    const replay = await request(
      `/auth/callback?code=abc&state=${location.searchParams.get("state")}`,
      sidOf(first),
    );
    expect(replay.headers.get("location")).toBe("/?error=state");
  });
});

describe("dashboard", () => {
  test("requires login", async () => {
    const res = await request("/dashboard");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
  });

  test("renders limits without exposing the token (HTML and Inertia JSON)", async () => {
    const cookie = await login();
    const calls = mockFetch(() => Response.json(RATE_LIMIT));

    const html = await (await request("/dashboard", cookie)).text();
    expect(html).toContain('"component":"Dashboard"');
    expect(html).not.toContain(TOKEN);

    const res = await request("/dashboard", cookie, { "X-Inertia": "true" });
    const text = await res.text();
    expect(text).not.toContain(TOKEN);
    const page = JSON.parse(text);
    expect(page.props.limits.ok).toBe(true);
    expect(page.props.limits.raw).toEqual(RATE_LIMIT);
    expect(page.props.limits.resources.map((r: { name: string }) => r.name)).toEqual([
      "core",
      "search",
      "graphql",
      "code_scanning_upload",
    ]);
    const headers = new Headers(calls[0]!.init!.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("User-Agent")).toBeTruthy();
  });

  test("partial reload of limits works", async () => {
    const cookie = await login();
    mockFetch(() => Response.json(RATE_LIMIT));
    const res = await request("/dashboard", cookie, {
      "X-Inertia": "true",
      "X-Inertia-Partial-Component": "Dashboard",
      "X-Inertia-Partial-Data": "limits",
    });
    const page = (await res.json()) as any;
    expect(page.props.limits.ok).toBe(true);
  });

  test("a revoked token (401) clears the session and redirects to login", async () => {
    const cookie = await login();
    mockFetch(() => new Response("Bad credentials", { status: 401 }));
    const res = await request("/dashboard", cookie, { "X-Inertia": "true" });
    expect(res.headers.get("location")).toBe("/?error=expired");
    expect(res.headers.getSetCookie().find((c) => c.startsWith("sid="))).toContain("Max-Age=0");
  });

  test("network failures and timeouts become an error prop instead of a 500", async () => {
    const cookie = await login();
    mockFetch(() => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const res = await request("/dashboard", cookie, { "X-Inertia": "true" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).props.limits).toEqual({
      ok: false,
      error: "The GitHub API timed out",
    });

    mockFetch(() => new Response("oops", { status: 503 }));
    const res2 = await request("/dashboard", cookie, { "X-Inertia": "true" });
    expect(((await res2.json()) as any).props.limits.ok).toBe(false);
  });
});

describe("session lifetime", () => {
  const HOUR = 60 * 60 * 1000;

  test("an expired cookie is rejected server-side", async () => {
    const start = Date.now();
    setSystemTime(start);
    const cookie = await login();
    setSystemTime(start + 25 * HOUR);
    expect((await request("/dashboard", cookie)).headers.get("location")).toBe("/");
  });

  test("activity slides the inactivity window", async () => {
    const start = Date.now();
    setSystemTime(start);
    const cookie = await login();
    mockFetch(() => Response.json(RATE_LIMIT));
    setSystemTime(start + 23 * HOUR);
    const renewed = sidOf(await request("/dashboard", cookie))!;
    setSystemTime(start + 25 * HOUR);
    expect((await request("/dashboard", renewed)).status).toBe(200);
  });

  test("the absolute lifetime (7 days) cannot be extended", async () => {
    const start = Date.now();
    setSystemTime(start);
    let cookie = await login();
    mockFetch(() => Response.json(RATE_LIMIT));
    for (let h = 20; h < 7 * 24; h += 20) {
      setSystemTime(start + h * HOUR);
      cookie = sidOf(await request("/dashboard", cookie)) ?? cookie;
    }
    setSystemTime(start + (7 * 24 + 1) * HOUR);
    expect((await request("/dashboard", cookie)).headers.get("location")).toBe("/");
  });
});

describe("logout", () => {
  test("POST /logout clears the cookie", async () => {
    const cookie = await login();
    const res = await app.request(
      "/logout",
      { method: "POST", headers: { Cookie: cookie, Origin: "http://localhost" } },
      ENV,
    );
    expect(res.status).toBe(303);
    expect(res.headers.getSetCookie().find((c) => c.startsWith("sid="))).toContain("Max-Age=0");
  });

  test("cross-site POST /logout is blocked", async () => {
    const cookie = await login();
    const res = await app.request(
      "/logout",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "https://evil.example",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
      ENV,
    );
    expect(res.status).toBe(403);
  });
});

test("normalizeRateLimits keeps limit: 0 resources and orders core/search/graphql first", () => {
  const out = normalizeRateLimits(RATE_LIMIT);
  expect(out[0]).toEqual({
    name: "core",
    limit: 5000,
    used: 100,
    remaining: 4900,
    reset: 2000000000,
  });
  expect(out.find((r) => r.name === "code_scanning_upload")?.limit).toBe(0);
  expect(() => normalizeRateLimits({})).toThrow();
});
