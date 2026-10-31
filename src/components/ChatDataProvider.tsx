'use client';

import type { User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState } from 'react';
import { subscribeMe, upsertProfile } from '@/chat/reads';
import { subscribeMyRooms } from '@/chat/rooms';
import type { MemberInput, Room, UserProfile } from '@/chat/types';
import { displayNameOf, photoOf } from '@/lib/format';
import { useAuth } from './AuthProvider';

interface ChatData {
  user: User;
  /** Public identity used when creating rooms. */
  self: MemberInput;
  /** undefined while the first snapshot is loading. */
  rooms: Room[] | undefined;
  /** undefined while loading, null if the profile doc does not exist yet. */
  me: UserProfile | null | undefined;
  error: string | null;
}

const ChatContext = createContext<ChatData | null>(null);

/** Chat data, or null until a user is signed in (and during prerendering). */
export function useChat(): ChatData | null {
  return useContext(ChatContext);
}

/** For components that only render once useChat() is non-null. */
export function useReadyChat(): ChatData {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useReadyChat used before chat data is ready');
  return value;
}

/**
 * Owns the app's only two long-lived listeners: the user's rooms (list, previews,
 * members, counters) and the user's own doc (read cursors). Every screen reads
 * room data from here, so opening a room never costs an extra room-doc read.
 */
export function ChatDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Remount per user so listeners and state never leak across sign-ins.
  return user ? (
    <ChatData key={user.uid} user={user}>
      {children}
    </ChatData>
  ) : (
    <ChatContext.Provider value={null}>{children}</ChatContext.Provider>
  );
}

function ChatData({ user, children }: { user: User; children: React.ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>();
  const [me, setMe] = useState<UserProfile | null>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onError = (e: Error) => setError(e.message);
    const stopRooms = subscribeMyRooms(user.uid, setRooms, onError);
    const stopMe = subscribeMe(user.uid, setMe, onError);
    return () => {
      stopRooms();
      stopMe();
    };
  }, [user.uid]);

  const name = me?.displayName ?? displayNameOf(user);
  const photoURL = photoOf(user);

  // Write the profile only when it is missing or out of date (each write re-bills our own listener).
  useEffect(() => {
    if (me === undefined) return;
    if (!me || !me.displayName || (me.photoURL ?? null) !== photoURL) {
      void upsertProfile(user.uid, me?.displayName ?? displayNameOf(user), photoURL).catch(() => {});
    }
  }, [me, user, photoURL]);

  return (
    <ChatContext.Provider value={{ user, self: { uid: user.uid, name, photoURL }, rooms, me, error }}>
      {children}
    </ChatContext.Provider>
  );
}
