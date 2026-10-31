import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getDb } from '../firebase';
import { userConverter, type Room, type UserProfile } from './types';

const userRef = (uid: string) => doc(getDb(), 'users', uid);

export function upsertProfile(uid: string, displayName: string, photoURL: string | null): Promise<void> {
  return setDoc(userRef(uid), { displayName, photoURL }, { merge: true });
}

/** Own profile + read cursors. 1 read on attach, 1 per markRead (also syncs other devices). */
export function subscribeMe(
  uid: string,
  onUser: (user: UserProfile | null) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    userRef(uid).withConverter(userConverter),
    (snap) => onUser(snap.exists() ? snap.data() : null),
    onError,
  );
}

/** Exact unread count with zero extra reads: both numbers are already in memory. */
export function unreadCount(room: Room, user: UserProfile | null): number {
  return Math.max(0, room.messageCount - (user?.reads?.[room.id]?.count ?? 0));
}

/** Skips the write (and the listener re-read it would trigger) when already caught up. */
export async function markRead(uid: string, room: Room, user: UserProfile | null): Promise<void> {
  if ((user?.reads?.[room.id]?.count ?? -1) >= room.messageCount) return;
  await setDoc(
    userRef(uid),
    { reads: { [room.id]: { count: room.messageCount, at: serverTimestamp() } } },
    { merge: true },
  );
}
