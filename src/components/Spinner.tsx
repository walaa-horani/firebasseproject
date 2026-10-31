export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-3 p-8 text-sm text-zinc-500" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-500 dark:border-zinc-700" />
      {label}
    </div>
  );
}
