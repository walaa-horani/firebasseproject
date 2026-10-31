import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  FieldPath,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from '../firebase';
import { roomConverter, type MemberInput, type Role, type Room } from './types';

export const roomsCol = () => collection(getDb(), 'rooms').withConverter(roomConverter);
export const roomRef = (roomId: string) => doc(getDb(), 'rooms', roomId);

export async function createRoom(name: string, creator: MemberInput): Promise<string> {
  const ref = doc(collection(getDb(), 'rooms'));
  await setDoc(ref, {
    name,
    createdBy: creator.uid,
    createdAt: serverTimestamp(),
    memberIds: [creator.uid],
    members: {
      [creator.uid]: {
        name: creator.name,
        photoURL: creator.photoURL,
        role: 'owner',
        joinedAt: serverTimestamp(),
      },
    },
    lastMessage: null,
    lastMessageAt: serverTimestamp(),
    messageCount: 0,
  });
  return ref.id;
}

/** Owner/admin only. Re-adding a member who left clears their `left` flag. */
export function addMember(
  roomId: string,
  member: MemberInput,
  role: Exclude<Role, 'owner'> = 'member',
): Promise<void> {
  return updateDoc(
    roomRef(roomId),
    'memberIds',
    arrayUnion(member.uid),
    new FieldPath('members', member.uid),
    { name: member.name, photoURL: member.photoURL, role, joinedAt: serverTimestamp() },
  );
}

/** Owner/admin removes someone, or any member removes themselves (leave). */
export function removeMember(roomId: string, uid: string): Promise<void> {
  return updateDoc(
    roomRef(roomId),
    'memberIds',
    arrayRemove(uid),
    new FieldPath('members', uid, 'left'),
    true,
  );
}

export function renameRoom(roomId: string, name: string): Promise<void> {
  return updateDoc(roomRef(roomId), { name });
}

/** Owner only. Messages subcollection is not deleted (Firestore never cascades). */
export function deleteRoom(roomId: string): Promise<void> {
  return deleteDoc(roomRef(roomId));
}

/**
 * The one app-wide listener for room metadata: list, previews, members, unread
 * counts and the open room's header all come from here. Billed 1 read per room
 * on attach, then 1 read per room that changes.
 */
export function subscribeMyRooms(
  uid: string,
  onRooms: (rooms: Room[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(
    roomsCol(),
    where('memberIds', 'array-contains', uid),
    orderBy('lastMessageAt', 'desc'),
  );
  return onSnapshot(q, (snap) => onRooms(snap.docs.map((d) => d.data())), onError);
}
