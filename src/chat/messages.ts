import {
  collection,
  doc,
  getDocs,
  getDocsFromCache,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from '../firebase';
import { roomRef } from './rooms';
import { messageConverter, type Message } from './types';

export const PAGE_SIZE = 30;
export const MAX_TEXT = 4000;
const PREVIEW_LEN = 140;

const messagesCol = (roomId: string) =>
  collection(getDb(), 'rooms', roomId, 'messages').withConverter(messageConverter);

/**
 * One atomic batch: the message plus the room's preview/counter. Recipients pay
 * 1 read for the message (if the room is open) + 1 for the room doc change.
 */
export async function sendMessage(roomId: string, senderId: string, text: string): Promise<string> {
  const body = text.trim();
  if (!body || body.length > MAX_TEXT) throw new Error(`Message must be 1-${MAX_TEXT} characters`);

  const msgRef = doc(collection(getDb(), 'rooms', roomId, 'messages'));
  const batch = writeBatch(getDb());
  batch.set(msgRef, { senderId, text: body, type: 'text', sentAt: serverTimestamp() });
  batch.update(roomRef(roomId), {
    lastMessage: {
      id: msgRef.id,
      text: body.slice(0, PREVIEW_LEN),
      senderId,
      sentAt: serverTimestamp(),
    },
    lastMessageAt: serverTimestamp(),
    messageCount: increment(1),
  });
  await batch.commit();
  return msgRef.id;
}

export function editMessage(roomId: string, messageId: string, text: string): Promise<void> {
  const body = text.trim();
  if (!body || body.length > MAX_TEXT) throw new Error(`Message must be 1-${MAX_TEXT} characters`);
  return updateDoc(doc(getDb(), 'rooms', roomId, 'messages', messageId), {
    text: body,
    editedAt: serverTimestamp(),
  });
}

/** Soft delete keeps the doc so cached clients and counters stay consistent. */
export function softDeleteMessage(roomId: string, messageId: string): Promise<void> {
  return updateDoc(doc(getDb(), 'rooms', roomId, 'messages', messageId), {
    deleted: true,
    text: '',
    editedAt: serverTimestamp(),
  });
}

export interface MessageSubscription {
  unsubscribe: Unsubscribe;
  /** Loads the next older page, cache first. Resolves false when history is exhausted. */
  loadOlder: () => Promise<boolean>;
}

const bySentAt = (a: QueryDocumentSnapshot<Message>, b: QueryDocumentSnapshot<Message>) =>
  a.data().sentAt.toMillis() - b.data().sentAt.toMillis();

/**
 * Cache-first, incremental message stream for one room.
 *
 * 1. Render the newest page straight from the local cache (0 billed reads).
 * 2. Listen only for messages newer than the newest cached one, so reopening a
 *    room bills just what arrived since (minimum 1 read if nothing did).
 * 3. Listen for edits/soft deletes made after that point (same minimum).
 * First open on a device has no cache, so it listens to the latest page instead.
 */
export function subscribeMessages(
  roomId: string,
  onMessages: (messages: Message[]) => void,
  onError?: (e: Error) => void,
): MessageSubscription {
  const col = messagesCol(roomId);
  const byId = new Map<string, QueryDocumentSnapshot<Message>>();
  const unsubs: Unsubscribe[] = [];
  let stopped = false;

  const sorted = () => [...byId.values()].sort(bySentAt);
  const emit = () => onMessages(sorted().map((d) => d.data()));
  const apply = (snap: QuerySnapshot<Message>) => {
    // 'removed' only means a doc left a limit() window; messages are never hard-deleted.
    for (const change of snap.docChanges()) {
      if (change.type !== 'removed') byId.set(change.doc.id, change.doc);
    }
    emit();
  };

  void (async () => {
    const cached = await getDocsFromCache(
      query(col, orderBy('sentAt', 'desc'), limit(PAGE_SIZE)),
    ).catch(() => null);
    if (stopped) return;

    cached?.docs.forEach((d) => byId.set(d.id, d));
    if (byId.size) emit();

    const newest = cached?.docs[0]?.data().sentAt;
    if (newest) {
      unsubs.push(
        onSnapshot(query(col, where('sentAt', '>', newest), orderBy('sentAt')), apply, onError),
        onSnapshot(query(col, where('editedAt', '>', newest)), apply, onError),
      );
    } else {
      unsubs.push(onSnapshot(query(col, orderBy('sentAt', 'desc'), limit(PAGE_SIZE)), apply, onError));
    }
  })();

  async function loadOlder(): Promise<boolean> {
    const oldest = sorted()[0];
    if (!oldest) return false;
    const q = query(col, orderBy('sentAt', 'desc'), startAfter(oldest), limit(PAGE_SIZE));
    let snap = await getDocsFromCache(q).catch(() => null);
    if (!snap || snap.size < PAGE_SIZE) snap = await getDocs(q);
    snap.docs.forEach((d) => byId.set(d.id, d));
    emit();
    return snap.size === PAGE_SIZE;
  }

  return {
    unsubscribe: () => {
      stopped = true;
      unsubs.forEach((u) => u());
    },
    loadOlder,
  };
}
