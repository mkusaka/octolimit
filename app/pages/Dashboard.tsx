import { Link, router, usePoll } from "@inertiajs/react";
import { useEffect, useState } from "react";
import { PRIORITY, type LimitsResult, type RateLimit } from "../github";
import { Logo } from "../Logo";

type OkLimits = Extract<LimitsResult, { ok: true }>;

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}

function tone(r: RateLimit) {
  const rate = r.limit > 0 ? r.used / r.limit : 0;
  if (r.limit > 0 && r.remaining === 0)
    return { bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", rate };
  if (rate >= 0.9) return { bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", rate };
  if (rate >= 0.7) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", rate };
  return { bar: "bg-emerald-500", text: "text-zinc-900 dark:text-zinc-50", rate };
}

function Meter({ r, className = "" }: { r: RateLimit; className?: string }) {
  const { bar, rate } = tone(r);
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-800 ${className}`}
      role="meter"
      aria-label={`${r.name} usage`}
      aria-valuemin={0}
      aria-valuemax={r.limit}
      aria-valuenow={r.used}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${bar}`}
        style={{ width: `${Math.min(rate, 1) * 100}%` }}
      />
    </div>
  );
}

function Reset({ r, now }: { r: RateLimit; now: number }) {
  const left = r.reset - Math.floor(now / 1000);
  const at = new Date(r.reset * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return left > 0 ? (
    <span>
      <span className="font-mono tabular-nums text-zinc-700 dark:text-zinc-300">
        {formatCountdown(left)}
      </span>{" "}
      until reset ({at})
    </span>
  ) : (
    <span>Reset — updates on next refresh</span>
  );
}

function PrimaryCard({ r, now }: { r: RateLimit; now: number }) {
  const { text, rate } = tone(r);
  return (
    <li className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-sm font-medium text-zinc-500 dark:text-zinc-400">{r.name}</h2>
        {r.limit > 0 && (
          <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {Math.round(rate * 100)}%
          </span>
        )}
      </div>
      {r.limit === 0 ? (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Not available for this account
        </p>
      ) : (
        <>
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className={`text-4xl font-semibold tracking-tight tabular-nums ${text}`}>
              {r.remaining.toLocaleString()}
            </span>
            <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
              / {r.limit.toLocaleString()}
            </span>
          </p>
          <Meter r={r} className="mt-4" />
        </>
      )}
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        <Reset r={r} now={now} />
      </p>
    </li>
  );
}

function SecondaryRow({ r, now }: { r: RateLimit; now: number }) {
  const { text } = tone(r);
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[minmax(0,17rem)_1fr_7rem]">
      <span className="truncate font-mono text-sm" title={r.name}>
        {r.name}
      </span>
      {r.limit === 0 ? (
        <span className="text-right text-xs text-zinc-400 sm:order-last dark:text-zinc-500">
          Unavailable
        </span>
      ) : (
        <span className={`text-right text-sm tabular-nums sm:order-last ${text}`}>
          {r.remaining.toLocaleString()}
          <span className="text-zinc-400 dark:text-zinc-500"> / {r.limit.toLocaleString()}</span>
        </span>
      )}
      <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
        {r.limit > 0 && <Meter r={r} className="w-24 shrink-0" />}
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          <Reset r={r} now={now} />
        </span>
      </div>
    </li>
  );
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

function CopyJsonButton({ raw }: { raw: unknown }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const id = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(id);
  }, [state]);
  const copy = () =>
    navigator.clipboard.writeText(JSON.stringify(raw, null, 2)).then(
      () => setState("copied"),
      () => setState("failed"),
    );
  return (
    <button type="button" onClick={copy} className={buttonClass} aria-live="polite">
      <svg {...iconProps}>
        {state === "copied" ? (
          <path d="M20 6 9 17l-5-5" />
        ) : (
          <>
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </>
        )}
      </svg>
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy JSON"}
    </button>
  );
}

export default function Dashboard({ limits }: { limits: LimitsResult }) {
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  // Keep showing the last good data when a refresh fails.
  const [lastOk, setLastOk] = useState<OkLimits | null>(limits.ok ? limits : null);

  useEffect(() => {
    if (limits.ok) setLastOk(limits);
  }, [limits]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const reloadOptions = {
    only: ["limits"],
    preserveState: true,
    preserveScroll: true,
    onStart: () => setLoading(true),
    onFinish: () => setLoading(false),
  };
  usePoll(60_000, reloadOptions);
  // Refresh when coming back to the tab/app; mobile PWAs fire visibilitychange rather than focus.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.reload(reloadOptions);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const primary = lastOk?.resources.filter((r) => PRIORITY.includes(r.name)) ?? [];
  const secondary = lastOk?.resources.filter((r) => !PRIORITY.includes(r.name)) ?? [];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-zinc-200/80 bg-zinc-50/80 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Logo />
            octolimit
          </div>
          <Link
            href="/logout"
            method="post"
            as="button"
            className="rounded-lg px-2 py-1.5 text-sm text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Sign out
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 pb-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">GitHub API Rate Limit</h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span
                className={`size-1.5 rounded-full ${limits.ok ? "bg-emerald-500" : "bg-rose-500"}`}
              />
              {lastOk
                ? `Fetched at ${new Date(lastOk.fetchedAt).toLocaleTimeString()} · auto-refreshes every 60s`
                : "Not fetched yet"}
            </p>
          </div>
          <div className="flex gap-2">
            {lastOk && <CopyJsonButton raw={lastOk.raw} />}
            <button
              type="button"
              onClick={() => router.reload(reloadOptions)}
              disabled={loading}
              className={buttonClass}
            >
              <svg {...iconProps} className={loading ? "animate-spin" : ""}>
                <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              {loading ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>

        {!limits.ok && (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
          >
            {limits.error}
            {lastOk && " Showing the last fetched data."}
          </p>
        )}

        {primary.length > 0 && (
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {primary.map((r) => (
              <PrimaryCard key={r.name} r={r} now={now} />
            ))}
          </ul>
        )}

        {secondary.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Other resources
            </h2>
            <ul className="mt-3 divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {secondary.map((r) => (
                <SecondaryRow key={r.name} r={r} now={now} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
