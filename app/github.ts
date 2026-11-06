export type RateLimit = {
  name: string;
  limit: number;
  used: number;
  remaining: number;
  /** Unix epoch seconds */
  reset: number;
};

export type LimitsResult =
  | { ok: true; resources: RateLimit[]; raw: unknown; fetchedAt: number }
  | { ok: false; error: string };

export class GitHubUnauthorizedError extends Error {}

export const PRIORITY = ["core", "search", "graphql"];

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "octolimit",
  "X-GitHub-Api-Version": "2022-11-28",
};

export function normalizeRateLimits(body: unknown): RateLimit[] {
  const resources = (body as { resources?: Record<string, Partial<RateLimit>> } | null)?.resources;
  if (!resources || typeof resources !== "object")
    throw new Error("Unexpected /rate_limit response");
  const rank = (name: string) => {
    const i = PRIORITY.indexOf(name);
    return i === -1 ? PRIORITY.length : i;
  };
  return Object.entries(resources)
    .map(([name, r]) => ({
      name,
      limit: Number(r.limit ?? 0),
      used: Number(r.used ?? 0),
      remaining: Number(r.remaining ?? 0),
      reset: Number(r.reset ?? 0),
    }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/** Throws GitHubUnauthorizedError on 401; other failures are returned as `{ ok: false }`. */
export async function fetchRateLimits(token: string, timeoutMs = 10_000): Promise<LimitsResult> {
  let res: Response;
  try {
    res = await fetch("https://api.github.com/rate_limit", {
      headers: { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    return {
      ok: false,
      error: timedOut ? "The GitHub API timed out" : "Could not reach the GitHub API",
    };
  }
  if (res.status === 401) throw new GitHubUnauthorizedError();
  if (!res.ok) return { ok: false, error: `The GitHub API returned an error (HTTP ${res.status})` };
  try {
    const raw: unknown = await res.json();
    return { ok: true, resources: normalizeRateLimits(raw), raw, fetchedAt: Date.now() };
  } catch {
    return { ok: false, error: "Could not parse the GitHub API response" };
  }
}
