import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { getDb, getFirebaseApp } from '@/firebase';

// Own service worker (scope '/') so it can see every app window and skip the
// notification when the recipient is already looking at the room.
const SW_URL = '/firebase-messaging-sw.js';
const storageKey = (uid: string) => `push-token:${uid}`;

export type PushState = 'unsupported' | 'blocked' | 'off' | 'on';

function readStored(uid: string): string | null {
  try {
    return localStorage.getItem(storageKey(uid));
  } catch {
    return null;
  }
}

function writeStored(uid: string, token: string | null) {
  try {
    if (token) localStorage.setItem(storageKey(uid), token);
    else localStorage.removeItem(storageKey(uid));
  } catch {
    // Storage unavailable (private mode): we just re-register next time.
  }
}

async function deviceId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const deviceRef = async (uid: string, token: string) => doc(getDb(), 'users', uid, 'devices', await deviceId(token));

export async function pushState(uid: string): Promise<PushState> {
  if (typeof window === 'undefined' || !('Notification' in window) || !(await isSupported())) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && readStored(uid) ? 'on' : 'off';
}

/**
 * Gets this browser's FCM token and stores it under users/{uid}/devices.
 * Writes only when the token is new or changed (each write triggers a function).
 */
async function register(uid: string): Promise<void> {
  const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  const token = await getToken(getMessaging(getFirebaseApp()), { serviceWorkerRegistration: registration });
  const previous = readStored(uid);
  if (token === previous) return;
  if (previous) await deleteDoc(await deviceRef(uid, previous)).catch(() => {});
  await setDoc(await deviceRef(uid, token), { token, updatedAt: serverTimestamp() });
  writeStored(uid, token);
}

/** Must run from a user gesture (permission prompt). */
export async function enablePush(uid: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  await register(uid);
  return 'on';
}

/** On app start: refresh the token silently if push was enabled before. */
export async function syncPush(uid: string): Promise<void> {
  if ((await pushState(uid)) === 'on') await register(uid);
}

/** Stop pushes to this browser for this user (also used on sign-out). */
export async function disablePush(uid: string): Promise<void> {
  const token = readStored(uid);
  if (!token) return;
  writeStored(uid, null);
  await deleteDoc(await deviceRef(uid, token)).catch(() => {});
  await deleteToken(getMessaging(getFirebaseApp())).catch(() => {});
}
