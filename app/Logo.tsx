export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" className="fill-zinc-900 dark:fill-zinc-100" />
      <path
        d="M6 16a6 6 0 1 1 12 0"
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="round"
        className="stroke-zinc-50 dark:stroke-zinc-900"
      />
      <path
        d="M12 16l3-4"
        fill="none"
        strokeWidth="2.2"
        strokeLinecap="round"
        className="stroke-emerald-400 dark:stroke-emerald-600"
      />
    </svg>
  );
}
