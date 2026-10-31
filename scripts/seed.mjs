// Seeds demo data into the live project through the client SDK, so every write
// goes through firestore.rules exactly like the real app.
// Usage: node scripts/seed.mjs   (optional: SEED_PASSWORD=... to reuse accounts)
import { randomBytes } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  arrayUnion,
  collection,
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
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBLndk15i4A0Ve0iPVXnxCETVYf4Xl7iLg',
  authDomain: 'team-chat-walaa.firebaseapp.com',
  projectId: 'team-chat-walaa',
  storageBucket: 'team-chat-walaa.firebasestorage.app',
  messagingSenderId: '253128482281',
  appId: '1:253128482281:web:1fd070586be9fe527b7f78',
};

const password = process.env.SEED_PASSWORD ?? randomBytes(9).toString('base64url');
const people = {
  alice: { email: 'alice@demo.team-chat.test', name: 'Alice' },
  bob: { email: 'bob@demo.team-chat.test', name: 'Bob' },
  carol: { email: 'carol@demo.team-chat.test', name: 'Carol' },
};

// One app per user so each write is made with that user's credentials.
const sessions = {};
for (const [key, p] of Object.entries(people)) {
  const app = initializeApp(firebaseConfig, key);
  const auth = getAuth(app);
  const cred = await createUserWithEmailAndPassword(auth, p.email, password).catch((e) => {
    if (e.code !== 'auth/email-already-in-use') throw e;
    return signInWithEmailAndPassword(auth, p.email, password);
  });
  sessions[key] = { app, auth, db: getFirestore(app), uid: cred.user.uid, ...p };
  console.log(`signed in ${p.email} -> ${cred.user.uid}`);
}
const { alice, bob, carol } = sessions;

async function upsertProfile(s) {
  await setDoc(doc(s.db, 'users', s.uid), { displayName: s.name, photoURL: null }, { merge: true });
}

async function createRoom(s, name) {
  const ref = doc(collection(s.db, 'rooms'));
  await setDoc(ref, {
    name,
    createdBy: s.uid,
    createdAt: serverTimestamp(),
    memberIds: [s.uid],
    members: { [s.uid]: { name: s.name, photoURL: null, role: 'owner', joinedAt: serverTimestamp() } },
    lastMessage: null,
    lastMessageAt: serverTimestamp(),
    messageCount: 0,
  });
  return ref.id;
}

async function addMember(s, roomId, m, role = 'member') {
  await updateDoc(
    doc(s.db, 'rooms', roomId),
    'memberIds',
    arrayUnion(m.uid),
    new FieldPath('members', m.uid),
    { name: m.name, photoURL: null, role, joinedAt: serverTimestamp() },
  );
}

async function send(s, roomId, text) {
  const msg = doc(collection(s.db, 'rooms', roomId, 'messages'));
  const batch = writeBatch(s.db);
  batch.set(msg, { senderId: s.uid, text, type: 'text', sentAt: serverTimestamp() });
  batch.update(doc(s.db, 'rooms', roomId), {
    lastMessage: { id: msg.id, text: text.slice(0, 140), senderId: s.uid, sentAt: serverTimestamp() },
    lastMessageAt: serverTimestamp(),
    messageCount: increment(1),
  });
  await batch.commit();
  return msg.id;
}

async function expectDenied(label, fn) {
  try {
    await fn();
    console.log(`  UNEXPECTED ALLOW: ${label}`);
    process.exitCode = 1;
  } catch (e) {
    console.log(`  denied as expected: ${label} (${e.code})`);
  }
}

for (const s of [alice, bob, carol]) await upsertProfile(s);

const general = await createRoom(alice, 'General');
await addMember(alice, general, bob, 'admin');
await addMember(bob, general, carol); // admin adds member
const design = await createRoom(alice, 'Design');
await addMember(alice, design, carol);
console.log(`rooms: General=${general} Design=${design}`);

const script = [
  [alice, 'Morning team! Stand-up in 10 minutes.'],
  [bob, 'On my way. Pushing the auth fix first.'],
  [carol, 'I will share the new chat mockups after stand-up.'],
  [alice, 'Great. Bob, can you review Carol\'s PR today?'],
  [bob, 'Yes, after lunch.'],
  [carol, 'Thanks! Link coming in a sec.'],
  [carol, 'typo mesage'],
  [bob, 'Oops, wrong room.'],
];
const ids = [];
for (const [s, text] of script) ids.push(await send(s, general, text));
await send(alice, design, 'Carol, let\'s keep design feedback in this room.');
await send(carol, design, 'Sounds good. Uploading Figma frames now.');

// Edit + soft delete through the same rules the app uses.
await updateDoc(doc(carol.db, 'rooms', general, 'messages', ids[6]), { text: 'typo message (fixed)', editedAt: serverTimestamp() });
await updateDoc(doc(bob.db, 'rooms', general, 'messages', ids[7]), { deleted: true, text: '', editedAt: serverTimestamp() });

// Read cursors: Alice read up to message 4 of General (4 unread), all of Design.
await setDoc(doc(alice.db, 'users', alice.uid), { reads: { [general]: { count: 4, at: serverTimestamp() } } }, { merge: true });
const designSnap = await getDoc(doc(alice.db, 'rooms', design));
await setDoc(
  doc(alice.db, 'users', alice.uid),
  { reads: { [design]: { count: designSnap.data().messageCount, at: serverTimestamp() } } },
  { merge: true },
);

console.log('rule checks against live backend:');
await expectDenied('carol (member) adds a member', () => addMember(carol, general, { uid: 'someone', name: 'X' }));
await expectDenied('bob edits carol\'s message', () =>
  updateDoc(doc(bob.db, 'rooms', general, 'messages', ids[2]), { text: 'hacked', editedAt: serverTimestamp() }));
await expectDenied('bob reads Design (not a member)', () => getDoc(doc(bob.db, 'rooms', design)));
await expectDenied('bob reads Design messages', () => getDocs(collection(bob.db, 'rooms', design, 'messages')));
await expectDenied('carol bumps counter without message', () =>
  updateDoc(doc(carol.db, 'rooms', general), { messageCount: increment(1) }));
await expectDenied('carol reads alice profile', () => getDoc(doc(carol.db, 'users', alice.uid)));

console.log('app queries:');
const myRooms = await getDocs(
  query(collection(alice.db, 'rooms'), where('memberIds', 'array-contains', alice.uid), orderBy('lastMessageAt', 'desc')),
);
const me = (await getDoc(doc(alice.db, 'users', alice.uid))).data();
for (const r of myRooms.docs) {
  const d = r.data();
  const unread = d.messageCount - (me.reads?.[r.id]?.count ?? 0);
  console.log(`  ${d.name}: ${d.messageCount} msgs, ${unread} unread for Alice, last="${d.lastMessage?.text}"`);
}
const page = await getDocs(query(collection(carol.db, 'rooms', general, 'messages'), orderBy('sentAt', 'desc'), limit(30)));
console.log(`  General page for Carol: ${page.size} messages`);

for (const s of [alice, bob, carol]) {
  await signOut(s.auth);
  await deleteApp(s.app);
}
console.log(`\nDemo accounts password: ${password}`);
