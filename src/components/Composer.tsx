'use client';

import { useState } from 'react';
import { MAX_TEXT, sendMessage } from '@/chat/messages';
import { errorMessage } from '@/lib/format';

export function Composer({ roomId, uid, onSent }: { roomId: string; uid: string; onSent: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function send() {
    const body = text.trim();
    if (!body) return;
    setError(null);
    setText('');
    onSent();
    // The batch is applied to the local cache immediately (optimistic UI); the
    // promise only settles once the server confirms it.
    sendMessage(roomId, uid, body).catch((e) => {
      setText(body);
      setError(errorMessage(e));
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="border-t border-zinc-200 p-3 dark:border-zinc-800"
    >
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={MAX_TEXT}
          placeholder="Write a message…  (Enter to send, Shift+Enter for a new line)"
          className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Send
        </button>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
        <span className="text-red-600">{error}</span>
        {text.length > MAX_TEXT - 500 && <span>{MAX_TEXT - text.length} characters left</span>}
      </div>
    </form>
  );
}
