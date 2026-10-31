'use client';

import { useState } from 'react';
import { editMessage, MAX_TEXT, softDeleteMessage } from '@/chat/messages';
import type { Message, Room } from '@/chat/types';
import { errorMessage, formatTime } from '@/lib/format';
import { Avatar } from './Avatar';

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function MessageList({ room, messages, uid }: { room: Room; messages: Message[]; uid: string }) {
  return (
    <ol className="space-y-0.5">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        // Consecutive messages from the same sender within 5 minutes share one header.
        const grouped =
          prev !== undefined &&
          prev.senderId === m.senderId &&
          m.sentAt.toMillis() - prev.sentAt.toMillis() < GROUP_WINDOW_MS;
        return <MessageItem key={m.id} room={room} message={m} own={m.senderId === uid} grouped={grouped} />;
      })}
    </ol>
  );
}

function MessageItem({ room, message, own, grouped }: { room: Room; message: Message; own: boolean; grouped: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [error, setError] = useState<string | null>(null);

  // Sender identity comes from the room doc already in memory (0 extra reads).
  const sender = room.members[message.senderId];
  const name = sender?.name ?? 'Unknown';

  async function save() {
    setError(null);
    try {
      await editMessage(room.id, message.id, draft);
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove() {
    if (!confirm('Delete this message?')) return;
    try {
      await softDeleteMessage(room.id, message.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <li className={`group flex gap-3 rounded-lg px-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 ${grouped ? 'py-0.5' : 'mt-2 py-1'}`}>
      <div className="w-8 shrink-0">{!grouped && <Avatar name={name} photoURL={sender?.photoURL} />}</div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{name}</span>
            {sender?.left && <span className="text-[11px] text-zinc-400">(left)</span>}
            <time className="text-[11px] text-zinc-500">{formatTime(message.sentAt)}</time>
          </p>
        )}

        {message.deleted ? (
          <p className="text-sm italic text-zinc-400">Message deleted</p>
        ) : editing ? (
          <div className="mt-1 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_TEXT}
              rows={2}
              className="w-full resize-y rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700"
            />
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={save} disabled={!draft.trim()} className="rounded-md bg-indigo-600 px-2 py-1 text-white disabled:opacity-40">
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(message.text);
                }}
                className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">
            {message.text}
            {message.editedAt && <span className="ml-1 text-[11px] text-zinc-400">(edited)</span>}
          </p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {own && !message.deleted && !editing && (
        <div className="invisible flex shrink-0 items-start gap-1 text-xs group-hover:visible group-focus-within:visible">
          <button type="button" onClick={() => setEditing(true)} className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800">
            Edit
          </button>
          <button type="button" onClick={remove} className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
