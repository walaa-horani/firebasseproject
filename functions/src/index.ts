import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/firestore';
import { setGlobalOptions } from 'firebase-functions/options';
import {
  chunk,
  collectTargets,
  diffMembers,
  isDeadToken,
  newMessage,
  pushData,
  type RoomData,
  type TokenMap,
} from './fanout.js';

initializeApp();
// Firestore is in eur3; europe-west1 is the closest functions region.
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

const db = getFirestore();
const roomTokensRef = (roomId: string) => db.doc(`roomTokens/${roomId}`);

/** deviceId -> token for one user (1 read per device doc). */
async function devicesOf(uid: string): Promise<Record<string, string>> {
  const snap = await db.collection(`users/${uid}/devices`).get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.get('token') as string]));
}

async function addMembers(ref: DocumentReference, uids: string[]): Promise<void> {
  const tokens: TokenMap = {};
  await Promise.all(uids.map(async (uid) => (tokens[uid] = await devicesOf(uid))));
  await ref.set({ tokens }, { merge: true });
}

async function removeMembers(ref: DocumentReference, uids: string[]): Promise<void> {
  const tokens = Object.fromEntries(uids.map((uid) => [uid, FieldValue.delete()]));
  await ref.set({ tokens }, { merge: true });
}

/** Cached tokens for a room; rebuilt once if missing (e.g. rooms created before deploy). */
async function roomTokens(roomId: string, room: RoomData): Promise<TokenMap> {
  const ref = roomTokensRef(roomId);
  const snap = await ref.get();
  if (snap.exists) return (snap.get('tokens') as TokenMap | undefined) ?? {};
  const tokens: TokenMap = {};
  await Promise.all(room.memberIds.map(async (uid) => (tokens[uid] = await devicesOf(uid))));
  await ref.set({ tokens });
  return tokens;
}

/**
 * One trigger for all room writes. The event carries the before/after room
 * (members, names, last message), so announcing a message costs a single read:
 * the room's cached device tokens.
 */
export const onRoomWritten = onDocumentWritten('rooms/{roomId}', async (event) => {
  const { roomId } = event.params;
  const before = event.data?.before.data() as RoomData | undefined;
  const after = event.data?.after.data() as RoomData | undefined;

  if (!after) {
    await roomTokensRef(roomId).delete();
    return;
  }

  const { added, removed } = diffMembers(before?.memberIds ?? [], after.memberIds);
  if (added.length) await addMembers(roomTokensRef(roomId), added);
  if (removed.length) await removeMembers(roomTokensRef(roomId), removed);

  const msg = newMessage(before, after);
  if (!msg) return;

  const tokens = await roomTokens(roomId, after);
  const targets = collectTargets(tokens, after.memberIds, msg.senderId);
  if (!targets.length) {
    // Recipients have no registered browser (notifications never enabled).
    const devicesPerMember = Object.fromEntries(after.memberIds.map((uid) => [uid, Object.keys(tokens[uid] ?? {}).length]));
    logger.info('no push targets', { roomId, messageId: msg.id, senderId: msg.senderId, devicesPerMember });
    return;
  }

  const data = pushData(roomId, after, msg);
  let sent = 0;
  const dead: typeof targets = [];
  for (const batch of chunk(targets, 500)) {
    const res = await getMessaging().sendEachForMulticast({
      tokens: batch.map((t) => t.token),
      // Data-only: the service worker decides whether to show it (skips if the
      // recipient is looking at this room right now).
      data,
      webpush: { headers: { Urgency: 'high', TTL: String(24 * 60 * 60) } },
    });
    sent += res.successCount;
    res.responses.forEach((r, i) => {
      const target = batch[i];
      if (target && isDeadToken(r.error?.code)) dead.push(target);
    });
  }

  // Deleting a dead device doc fires onDeviceWritten, which removes it from every room cache.
  await Promise.all(dead.map((t) => db.doc(`users/${t.uid}/devices/${t.deviceId}`).delete()));
  logger.info('push sent', { roomId, messageId: msg.id, targets: targets.length, sent, dead: dead.length });
});

/**
 * Keeps roomTokens in sync when a browser registers, refreshes or removes its
 * token. Costs 1 read per room the user belongs to, only on device changes.
 */
export const onDeviceWritten = onDocumentWritten('users/{uid}/devices/{deviceId}', async (event) => {
  const { uid, deviceId } = event.params;
  const before = event.data?.before.get('token') as string | undefined;
  const after = event.data?.after.exists ? (event.data.after.get('token') as string) : undefined;
  if (before === after) return;
  logger.info(after ? 'device registered' : 'device removed', { uid, deviceId });

  const rooms = await db.collection('rooms').where('memberIds', 'array-contains', uid).select().get();
  for (const docs of chunk(rooms.docs, 500)) {
    const batch = db.batch();
    for (const room of docs) {
      batch.set(
        roomTokensRef(room.id),
        { tokens: { [uid]: { [deviceId]: after ?? FieldValue.delete() } } },
        { merge: true },
      );
    }
    await batch.commit();
  }
});
