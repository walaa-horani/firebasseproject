import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  Timestamp,
} from 'firebase/firestore';

export type Role = 'owner' | 'admin' | 'member';

export interface Member {
  name: string;
  photoURL: string | null;
  role: Role;
  joinedAt: Timestamp;
  /** Set when the user leaves; entry is kept so old messages still resolve a name. */
  left?: true;
}

export interface LastMessage {
  id: string;
  text: string;
  senderId: string;
  sentAt: Timestamp;
}

export interface Room {
  id: string;
  name: string;
  createdBy: string;
  createdAt: Timestamp;
  memberIds: string[];
  members: Record<string, Member>;
  lastMessage: LastMessage | null;
  lastMessageAt: Timestamp;
  messageCount: number;
}

export interface ReadCursor {
  count: number;
  at: Timestamp;
}

export interface UserProfile {
  id: string;
  displayName: string;
  photoURL: string | null;
  reads: Record<string, ReadCursor>;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  type: 'text' | 'system';
  sentAt: Timestamp;
  editedAt?: Timestamp;
  deleted?: boolean;
}

/** The public bits of a user needed to add them to a room. */
export interface MemberInput {
  uid: string;
  name: string;
  photoURL: string | null;
}

// Converters: add the doc id on read, and resolve pending serverTimestamp()
// values to a local estimate so optimistic UI never sees null timestamps.
function converter<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(value: T): DocumentData {
      const data: DocumentData = { ...value };
      delete data.id;
      return data;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): T {
      const data = snapshot.data({ ...options, serverTimestamps: 'estimate' });
      return { id: snapshot.id, ...data } as T;
    },
  };
}

export const roomConverter = converter<Room>();
export const messageConverter = converter<Message>();
export const userConverter = converter<UserProfile>();
