'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addMember, deleteRoom, removeMember, renameRoom } from '@/chat/rooms';
import type { Member, Role, Room } from '@/chat/types';
import { errorMessage } from '@/lib/format';
import { Avatar } from './Avatar';
import { useReadyChat } from './ChatDataProvider';

const ROLE_ORDER: Record<Role, number> = { owner: 0, admin: 1, member: 2 };

// Mirrors canRemove() in firestore.rules so we only show actions that will succeed.
function canRemove(myRole: Role | undefined, target: Member): boolean {
  if (target.role === 'owner') return false;
  if (myRole === 'owner') return true;
  return myRole === 'admin' && target.role === 'member';
}

export function MembersPanel({ room, onClose }: { room: Room; onClose: () => void }) {
  const { user } = useReadyChat();
  const router = useRouter();
  const myRole = room.members[user.uid]?.role;
  const isManager = myRole === 'owner' || myRole === 'admin';

  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(room.name);
  const [newUid, setNewUid] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'member' | 'admin'>('member');

  const members = Object.entries(room.members)
    .filter(([, m]) => !m.left)
    .sort(([, a], [, b]) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name));

  async function act(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const input =
    'w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-zinc-700';

  return (
    <aside className="fixed inset-0 z-10 flex flex-col overflow-y-auto bg-white md:static md:w-80 md:border-l md:border-zinc-200 dark:bg-zinc-950 md:dark:border-zinc-800">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="font-semibold">Members ({members.length})</h2>
        <button type="button" onClick={onClose} className="rounded px-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900" aria-label="Close members">
          ✕
        </button>
      </header>

      {error && <p className="mx-4 mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <ul className="space-y-1 p-3">
        {members.map(([uid, m]) => (
          <li key={uid} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <Avatar name={m.name} photoURL={m.photoURL} size={28} />
            <span className="min-w-0 flex-1 truncate text-sm">
              {m.name}
              {uid === user.uid && <span className="text-zinc-500"> (you)</span>}
            </span>
            {m.role !== 'member' && (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {m.role}
              </span>
            )}
            {uid !== user.uid && isManager && canRemove(myRole, m) && (
              <button
                type="button"
                onClick={() => confirm(`Remove ${m.name} from the room?`) && act(() => removeMember(room.id, uid))}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {isManager && (
        <form
          className="space-y-2 border-t border-zinc-200 p-4 dark:border-zinc-800"
          onSubmit={(e) => {
            e.preventDefault();
            const uid = newUid.trim();
            if (room.memberIds.includes(uid)) return setError('That user is already a member.');
            void act(async () => {
              await addMember(room.id, { uid, name: newName.trim().slice(0, 100), photoURL: null }, newRole);
              setNewUid('');
              setNewName('');
            });
          }}
        >
          <h3 className="text-sm font-medium">Add member</h3>
          <input className={input} placeholder="User ID (they copy it from the sidebar)" value={newUid} onChange={(e) => setNewUid(e.target.value)} required maxLength={128} />
          <input className={input} placeholder="Display name" value={newName} onChange={(e) => setNewName(e.target.value)} required maxLength={100} />
          {myRole === 'owner' && (
            <select className={input} value={newRole} onChange={(e) => setNewRole(e.target.value as 'member' | 'admin')}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          )}
          <button type="submit" className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
            Add
          </button>
        </form>
      )}

      {isManager && (
        <form
          className="space-y-2 border-t border-zinc-200 p-4 dark:border-zinc-800"
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => renameRoom(room.id, name.trim().slice(0, 100)));
          }}
        >
          <h3 className="text-sm font-medium">Room name</h3>
          <div className="flex gap-2">
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            <button type="submit" disabled={name.trim() === room.name || !name.trim()} className="rounded-lg border border-zinc-300 px-3 text-sm disabled:opacity-40 dark:border-zinc-700">
              Save
            </button>
          </div>
        </form>
      )}

      <div className="mt-auto space-y-2 border-t border-zinc-200 p-4 dark:border-zinc-800">
        {myRole !== 'owner' && (
          <button
            type="button"
            onClick={() =>
              confirm('Leave this room?') &&
              act(async () => {
                await removeMember(room.id, user.uid);
                router.push('/rooms');
              })
            }
            className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Leave room
          </button>
        )}
        {myRole === 'owner' && (
          <button
            type="button"
            onClick={() =>
              confirm(`Delete "${room.name}" for everyone? This cannot be undone.`) &&
              act(async () => {
                await deleteRoom(room.id);
                router.push('/rooms');
              })
            }
            className="w-full rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
          >
            Delete room
          </button>
        )}
      </div>
    </aside>
  );
}
