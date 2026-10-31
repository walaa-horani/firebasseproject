import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const ROOM = 'room1';

const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

const member = (name: string, role: string) => ({
  name,
  photoURL: null,
  role,
  joinedAt: Timestamp.now(),
});

function send(db: Firestore, uid: string, text = 'hi', roomId = ROOM) {
  const msg = doc(collection(db, 'rooms', roomId, 'messages'));
  const batch = writeBatch(db);
  batch.set(msg, { senderId: uid, text, type: 'text', sentAt: serverTimestamp() });
  batch.update(doc(db, 'rooms', roomId), {
    lastMessage: { id: msg.id, text: text.slice(0, 140), senderId: uid, sentAt: serverTimestamp() },
    lastMessageAt: serverTimestamp(),
    messageCount: increment(1),
  });
  return { msg, commit: batch.commit() };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-team-chat',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(() => env.cleanup());

// Seed: alice owns room1, bob is admin, carol is member, eve is an outsider.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'rooms', ROOM), {
      name: 'General',
      createdBy: 'alice',
      createdAt: Timestamp.now(),
      memberIds: ['alice', 'bob', 'carol'],
      members: {
        alice: member('Alice', 'owner'),
        bob: member('Bob', 'admin'),
        carol: member('Carol', 'member'),
      },
      lastMessage: null,
      lastMessageAt: Timestamp.now(),
      messageCount: 0,
    });
    await setDoc(doc(db, 'rooms', ROOM, 'messages', 'm0'), {
      senderId: 'carol',
      text: 'seed',
      type: 'text',
      sentAt: Timestamp.now(),
    });
  });
});

describe('users', () => {
  it('owner reads and writes own profile and read cursors', async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(doc(db, 'users', 'alice'), { displayName: 'Alice', photoURL: null }, { merge: true }));
    await assertSucceeds(
      setDoc(doc(db, 'users', 'alice'), { reads: { [ROOM]: { count: 3, at: serverTimestamp() } } }, { merge: true }),
    );
    await assertSucceeds(getDoc(doc(db, 'users', 'alice')));
  });

  it('others cannot read or write a profile; unknown fields rejected', async () => {
    await assertFails(getDoc(doc(as('bob'), 'users', 'alice')));
    await assertFails(setDoc(doc(as('bob'), 'users', 'alice'), { displayName: 'x' }));
    await assertFails(setDoc(doc(as('alice'), 'users', 'alice'), { isAdmin: true }));
    await assertFails(setDoc(doc(as('alice'), 'users', 'alice'), { displayName: 'x'.repeat(101) }));
  });
});

describe('rooms', () => {
  it('members can list their rooms with the app query; outsiders and anon cannot', async () => {
    const q = (db: Firestore, uid: string) =>
      query(collection(db, 'rooms'), where('memberIds', 'array-contains', uid), orderBy('lastMessageAt', 'desc'));
    await assertSucceeds(getDocs(q(as('carol'), 'carol')));
    await assertFails(getDocs(q(as('eve'), 'alice')));
    await assertFails(getDoc(doc(as('eve'), 'rooms', ROOM)));
    await assertFails(getDoc(doc(anon(), 'rooms', ROOM)));
  });

  it('creator becomes sole owner; cannot seed other members or counters', async () => {
    const db = as('eve');
    const base = {
      name: 'Eve room',
      createdBy: 'eve',
      createdAt: serverTimestamp(),
      memberIds: ['eve'],
      members: { eve: { name: 'Eve', photoURL: null, role: 'owner', joinedAt: serverTimestamp() } },
      lastMessage: null,
      lastMessageAt: serverTimestamp(),
      messageCount: 0,
    };
    await assertSucceeds(setDoc(doc(db, 'rooms', 'r-eve'), base));
    await assertFails(setDoc(doc(db, 'rooms', 'r2'), { ...base, memberIds: ['eve', 'alice'] }));
    await assertFails(setDoc(doc(db, 'rooms', 'r3'), { ...base, createdBy: 'alice' }));
    await assertFails(setDoc(doc(db, 'rooms', 'r4'), { ...base, messageCount: 5 }));
    await assertFails(setDoc(doc(db, 'rooms', 'r5'), { ...base, createdAt: Timestamp.fromMillis(0) }));
  });

  it('admin adds a member; plain member and outsider cannot', async () => {
    const add = (db: Firestore, uid: string, role = 'member') =>
      updateDoc(
        doc(db, 'rooms', ROOM),
        'memberIds',
        arrayUnion(uid),
        new FieldPath('members', uid),
        { name: uid, photoURL: null, role, joinedAt: serverTimestamp() },
      );
    await assertSucceeds(add(as('bob'), 'dave'));
    await assertFails(add(as('carol'), 'frank'));
    await assertFails(add(as('eve'), 'eve'));
    await assertFails(add(as('bob'), 'gina', 'admin')); // only owner grants admin
    await assertFails(add(as('alice'), 'hank', 'owner'));
    await assertSucceeds(add(as('alice'), 'ivy', 'admin'));
  });

  it('members can leave, admins remove members, owner can never be removed', async () => {
    const remove = (db: Firestore, uid: string) =>
      updateDoc(doc(db, 'rooms', ROOM), 'memberIds', arrayRemove(uid), new FieldPath('members', uid, 'left'), true);
    await assertFails(remove(as('carol'), 'bob')); // member removing admin
    await assertFails(remove(as('bob'), 'alice')); // owner
    await assertFails(remove(as('alice'), 'alice')); // owner leaving
    await assertSucceeds(remove(as('bob'), 'carol'));
    await assertSucceeds(remove(as('bob'), 'bob')); // leave
  });

  it('only manager renames, only owner deletes', async () => {
    await assertFails(updateDoc(doc(as('carol'), 'rooms', ROOM), { name: 'x' }));
    await assertSucceeds(updateDoc(doc(as('bob'), 'rooms', ROOM), { name: 'Renamed' }));
    await assertFails(updateDoc(doc(as('bob'), 'rooms', ROOM), { createdBy: 'bob' }));
    await assertFails(deleteDoc(doc(as('bob'), 'rooms', ROOM)));
    await assertSucceeds(deleteDoc(doc(as('alice'), 'rooms', ROOM)));
  });
});

describe('messages', () => {
  it('members read pages; outsiders cannot', async () => {
    const page = (db: Firestore) =>
      getDocs(query(collection(db, 'rooms', ROOM, 'messages'), orderBy('sentAt', 'desc'), limit(30)));
    await assertSucceeds(page(as('carol')));
    await assertSucceeds(
      getDocs(query(collection(as('carol'), 'rooms', ROOM, 'messages'), where('sentAt', '>', Timestamp.fromMillis(0)))),
    );
    await assertFails(page(as('eve')));
  });

  it('member sends via batch (message + preview + counter)', async () => {
    await assertSucceeds(send(as('carol'), 'carol').commit);
  });

  it('cannot send as someone else, as outsider, or with too-long text', async () => {
    await assertFails(send(as('carol'), 'bob').commit);
    await assertFails(send(as('eve'), 'eve').commit);
    await assertFails(send(as('carol'), 'carol', 'x'.repeat(4001)).commit);
  });

  it('message without room update, and counter bump without message, are rejected', async () => {
    const db = as('carol');
    await assertFails(
      setDoc(doc(db, 'rooms', ROOM, 'messages', 'lonely'), {
        senderId: 'carol',
        text: 'x',
        type: 'text',
        sentAt: serverTimestamp(),
      }),
    );
    await assertFails(updateDoc(doc(db, 'rooms', ROOM), { messageCount: increment(1) }));
    await assertFails(
      updateDoc(doc(db, 'rooms', ROOM), {
        lastMessage: { id: 'm0', text: 'seed', senderId: 'carol', sentAt: serverTimestamp() },
        lastMessageAt: serverTimestamp(),
        messageCount: increment(1),
      }),
    );
  });

  it('sender edits and soft-deletes own message only', async () => {
    const m0 = (db: Firestore) => doc(db, 'rooms', ROOM, 'messages', 'm0');
    await assertFails(updateDoc(m0(as('bob')), { text: 'hacked', editedAt: serverTimestamp() }));
    await assertFails(updateDoc(m0(as('carol')), { senderId: 'bob', editedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(m0(as('carol')), { text: 'edited', editedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(m0(as('carol')), { deleted: true, text: '', editedAt: serverTimestamp() }));
    await assertFails(updateDoc(m0(as('carol')), { text: 'undelete', editedAt: serverTimestamp() }));
    await assertFails(deleteDoc(m0(as('carol'))));
  });
});
