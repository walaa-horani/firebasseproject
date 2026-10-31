'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { unreadCount } from '@/chat/reads';
import { createRoom } from '@/chat/rooms';
import { errorMessage, formatShort } from '@/lib/format';
import { disablePush } from '@/lib/push';
import { signOutUser } from './AuthProvider';
import { Avatar } from './Avatar';
import { useChat, useReadyChat } from './ChatDataProvider';
import { PushToggle } from './PushToggle';

const asideClass =
  'w-full shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 md:w-72 dark:border-zinc-800 dark:bg-zinc-950';

export function Sidebar() {
  // Prerendered shell (and pre-sign-in state): a static placeholder, no URL hooks.
  if (!useChat()) {
    return (
      <aside className={`hidden md:flex ${asideClass}`}>
        <p className="p-4 text-sm text-zinc-500">Loading…</p>
      </aside>
    );
  }
  return <SidebarContent />;
}

function SidebarContent() {
  const { self, rooms, me, error } = useReadyChat();
  const { roomId } = useParams<{ roomId?: string }>();
  const router = useRouter();
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setFormError(null);
    try {
      const id = await createRoom(name.slice(0, 100), self);
      setNewName('');
      router.push(`/rooms/${id}`);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyId() {
    await navigator.clipboard.writeText(self.uid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    // On phones the sidebar is the home screen and hides while a room is open.
    <aside className={`${roomId ? 'hidden md:flex' : 'flex'} ${asideClass}`}>
      <header className="flex items-center gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
        <Avatar name={self.name} photoURL={self.photoURL} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{self.name}</p>
          <button
            type="button"
            onClick={copyId}
            title={self.uid}
            className="text-xs text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            {copied ? 'Copied!' : 'Copy my user ID'}
          </button>
        </div>
        <button
          type="button"
          onClick={async () => {
            // Stop pushes for this account on this browser before signing out.
            await disablePush(self.uid).catch(() => {});
            await signOutUser();
          }}
          className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
        >
          Sign out
        </button>
      </header>

      <div className="pt-3">
        <PushToggle uid={self.uid} />
      </div>

      <form onSubmit={create} className="flex gap-2 px-3 pb-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New room name"
          maxLength={100}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Create
        </button>
      </form>
      {formError && <p className="px-4 pb-2 text-xs text-red-600">{formError}</p>}

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {error && <p className="p-2 text-xs text-red-600">{error}</p>}
        {rooms === undefined && <p className="p-2 text-sm text-zinc-500">Loading rooms…</p>}
        {rooms?.length === 0 && <p className="p-2 text-sm text-zinc-500">No rooms yet. Create one above.</p>}
        <ul className="space-y-0.5">
          {rooms?.map((room) => {
            const unread = me === undefined ? 0 : unreadCount(room, me);
            const last = room.lastMessage;
            const sender = last ? room.members[last.senderId]?.name : undefined;
            const active = room.id === roomId;
            return (
              <li key={room.id}>
                {/* Default prefetch: only the static shell, never Firestore data. */}
                <Link
                  href={`/rooms/${room.id}`}
                  className={`flex flex-col gap-0.5 rounded-lg px-3 py-2 ${
                    active ? 'bg-indigo-100 dark:bg-indigo-950' : 'hover:bg-zinc-200/60 dark:hover:bg-zinc-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`flex-1 truncate text-sm ${unread ? 'font-semibold' : 'font-medium'}`}>
                      {room.name}
                    </span>
                    <span className="text-[11px] text-zinc-500">{formatShort(last?.sentAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="flex-1 truncate text-xs text-zinc-500">
                      {last ? `${sender ?? 'Someone'}: ${last.text}` : 'No messages yet'}
                    </span>
                    {unread > 0 && (
                      <span className="rounded-full bg-indigo-600 px-1.5 text-[11px] font-semibold text-white">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
