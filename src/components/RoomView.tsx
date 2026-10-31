'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { subscribeMessages, type MessageSubscription } from '@/chat/messages';
import { markRead } from '@/chat/reads';
import type { Message, Room } from '@/chat/types';
import { errorMessage } from '@/lib/format';
import { useChat, useReadyChat } from './ChatDataProvider';
import { Composer } from './Composer';
import { MembersPanel } from './MembersPanel';
import { MessageList } from './MessageList';
import { Spinner } from './Spinner';

export function RoomView() {
  const { roomId } = useParams<{ roomId: string }>();
  const rooms = useChat()?.rooms;

  if (rooms === undefined) return <Spinner label="Loading room…" />;

  // Room data comes from the app-wide rooms listener: opening a room costs no room-doc read.
  const room = rooms.find((r) => r.id === roomId);
  if (!room) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-medium">Room not found</p>
        <p className="text-sm text-zinc-500">It may have been deleted, or you are no longer a member.</p>
        <Link href="/rooms" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
          Back to rooms
        </Link>
      </div>
    );
  }

  // key: remount per room so message state and listeners reset cleanly.
  return <RoomChat key={room.id} room={room} />;
}

function RoomChat({ room }: { room: Room }) {
  const { user, me } = useReadyChat();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [olderExhausted, setOlderExhausted] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);

  const subRef = useRef<MessageSubscription | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const restoreFromBottom = useRef<number | null>(null);
  const lastMarked = useRef(-1);

  const roomId = room.id;

  // Cache-first, incremental message stream; only this open room is listened to.
  useEffect(() => {
    const sub = subscribeMessages(
      roomId,
      (next) => {
        setMessages(next);
        setLoaded(true);
      },
      (e) => setError(errorMessage(e)),
    );
    subRef.current = sub;
    return () => sub.unsubscribe();
  }, [roomId]);

  // Mark read while the tab is visible. markRead also skips writes when already caught up.
  useEffect(() => {
    if (me === undefined) return;
    const mark = () => {
      if (document.visibilityState !== 'visible' || room.messageCount <= lastMarked.current) return;
      lastMarked.current = room.messageCount;
      void markRead(user.uid, room, me).catch(() => {
        lastMarked.current = -1;
      });
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [user.uid, room, me]);

  // Keep the view pinned to the newest message, or keep position after loading older ones.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restoreFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFromBottom.current;
      restoreFromBottom.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  async function loadOlder() {
    const el = scrollRef.current;
    if (!subRef.current || !el) return;
    setLoadingOlder(true);
    restoreFromBottom.current = el.scrollHeight - el.scrollTop;
    try {
      const more = await subRef.current.loadOlder();
      if (!more) setOlderExhausted(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingOlder(false);
    }
  }

  const activeMembers = Object.values(room.members).filter((m) => !m.left).length;
  const canLoadOlder = loaded && !olderExhausted && messages.length < room.messageCount;

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <Link href="/rooms" className="text-sm text-zinc-500 md:hidden" aria-label="Back to rooms">
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">{room.name}</h1>
            <p className="text-xs text-zinc-500">
              {activeMembers} member{activeMembers === 1 ? '' : 's'} · {room.messageCount} messages
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowMembers((v) => !v)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Members
          </button>
        </header>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          {canLoadOlder && (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                onClick={loadOlder}
                disabled={loadingOlder}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                {loadingOlder ? 'Loading…' : 'Load older messages'}
              </button>
            </div>
          )}
          {!loaded && !error && <Spinner label="Loading messages…" />}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {loaded && messages.length === 0 && (
            <p className="py-12 text-center text-sm text-zinc-500">No messages yet. Say hi!</p>
          )}
          <MessageList room={room} messages={messages} uid={user.uid} />
        </div>

        <Composer
          roomId={room.id}
          uid={user.uid}
          onSent={() => {
            stickToBottom.current = true;
          }}
        />
      </section>

      {showMembers && <MembersPanel room={room} onClose={() => setShowMembers(false)} />}
    </div>
  );
}
