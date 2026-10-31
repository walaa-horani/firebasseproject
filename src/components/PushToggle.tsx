'use client';

import { useEffect, useState } from 'react';
import { disablePush, enablePush, pushState, syncPush, type PushState } from '@/lib/push';
import { errorMessage } from '@/lib/format';

export function PushToggle({ uid }: { uid: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pushState(uid).then((s) => {
      if (cancelled) return;
      setState(s);
      // Tokens rotate; re-register quietly (writes only if the token changed).
      if (s === 'on') void syncPush(uid).catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (state === null || state === 'unsupported') return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (state === 'on') {
        await disablePush(uid);
        setState('off');
      } else {
        const next = await enablePush(uid);
        setState(next);
        if (next === 'off') {
          setError('Permission not granted. Click the icon left of the address bar and allow Notifications.');
        }
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 pb-3 text-xs">
      {state === 'blocked' ? (
        <p className="text-zinc-500">Notifications are blocked in your browser settings.</p>
      ) : (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className="flex w-full items-center justify-between rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <span>Notifications</span>
          <span className={state === 'on' ? 'font-semibold text-indigo-600 dark:text-indigo-400' : 'text-zinc-500'}>
            {busy ? '…' : state === 'on' ? 'On' : 'Off'}
          </span>
        </button>
      )}
      {error && <p className="mt-1 text-red-600">{error}</p>}
    </div>
  );
}
