'use client';

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { upsertProfile } from '@/chat/reads';
import { getFirebaseAuth } from '@/firebase';
import { errorMessage, photoOf } from '@/lib/format';
import { useAuth } from './AuthProvider';
import { Spinner } from './Spinner';

type Mode = 'signin' | 'signup';

export function SignIn() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace('/rooms');
  }, [user, router]);

  if (loading || user) return <Spinner />;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const google = () => run(() => signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider()));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const auth = getFirebaseAuth();
    run(async () => {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password);
        return;
      }
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const displayName = name.trim().slice(0, 100);
      await updateProfile(cred.user, { displayName });
      await upsertProfile(cred.user.uid, displayName, photoOf(cred.user));
    });
  };

  const input =
    'w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700';

  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-200 p-6 shadow-sm dark:border-zinc-800">
      <h1 className="text-xl font-semibold">Team Chat</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {mode === 'signin' ? 'Sign in to your workspace.' : 'Create an account.'}
      </p>

      <button
        type="button"
        onClick={google}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        or
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === 'signup' && (
          <input
            className={input}
            placeholder="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            autoComplete="name"
          />
        )}
        <input
          className={input}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <input
          className={input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
        }}
        className="mt-4 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}
