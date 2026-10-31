import { initials } from '@/lib/format';

export function Avatar({ name, photoURL, size = 32 }: { name: string; photoURL?: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (photoURL) {
    // eslint-disable-next-line @next/next/no-img-element -- external avatar URLs, no optimization needed
    return <img src={photoURL} alt="" style={style} className="shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />;
  }
  return (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
