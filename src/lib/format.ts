import type { User } from 'firebase/auth';
import type { Timestamp } from 'firebase/firestore';

/** Name shown to other members; falls back to the email's local part. */
export function displayNameOf(user: User): string {
  const name = user.displayName?.trim() || user.email?.split('@')[0] || 'Anonymous';
  return name.slice(0, 100);
}

/** Only https URLs up to 2048 chars pass the security rules. */
export function photoOf(user: User): string | null {
  const url = user.photoURL;
  return url && url.startsWith('https://') && url.length <= 2048 ? url : null;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export function formatTime(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  return timeFmt.format(ts.toDate());
}

/** Time for today, short date otherwise (room list). */
export function formatShort(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  const d = ts.toDate();
  return d.toDateString() === new Date().toDateString() ? timeFmt.format(d) : dayFmt.format(d);
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e) {
    const code = String((e as { code: unknown }).code);
    if (code.includes('permission-denied')) return 'You are not allowed to do that.';
    if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'Wrong email or password.';
    if (code.includes('email-already-in-use')) return 'An account with this email already exists.';
    if (code.includes('weak-password')) return 'Password must be at least 6 characters.';
    if (code.includes('popup-closed-by-user')) return 'Sign-in popup was closed.';
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}
