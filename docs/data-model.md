# Team chat — Firestore data model

Project `team-chat-walaa`, database `(default)`, **Standard edition** (billed per document read), location `eur3`.
Goal: fewest billed document reads for a realtime team chat with rooms of up to ~200 members.

## Collections

```
users/{uid}
  displayName, photoURL
  reads: { [roomId]: { count: number, at: Timestamp } }   // per-room read cursors

rooms/{roomId}
  name, createdBy (owner, never removable), createdAt
  memberIds: string[]                                      // access control + "my rooms" query
  members: { [uid]: { name, photoURL, role: 'owner'|'admin'|'member', joinedAt, left?: true } }
  lastMessage: { id, text (≤140), senderId, sentAt } | null
  lastMessageAt: Timestamp                                 // room-list sort key
  messageCount: number                                     // +1 per message

rooms/{roomId}/messages/{messageId}
  senderId, text (≤4000), type: 'text'|'system', sentAt, editedAt?, deleted?
```

## Where the reads go

| Need | How | Billed reads |
|---|---|---|
| Room list + previews | One app-wide listener `rooms where memberIds array-contains uid orderBy lastMessageAt desc` (`subscribeMyRooms`) | 1 per room on attach, then 1 per changed room |
| Members, roles | `members` map inside the room doc | 0 extra |
| Sender name/avatar | Messages store only `senderId`; resolve via `room.members[senderId]` | 0 extra |
| Unread count | `room.messageCount − user.reads[roomId].count` (`unreadCount`) | 0 extra |
| Open room header | Reuse the room doc from the room-list listener | 0 extra |
| Reopen a room | Render newest page from IndexedDB cache, listen only to `sentAt > newestCached` (+ edits since) (`subscribeMessages`) | only new/edited messages (min 1 per listener) |
| First open on a device | `orderBy sentAt desc limit 30` | 30 |
| Older history | `loadOlder()`: cache first, server only if the page isn't fully cached | 0 or 30 per page |
| Mark read | `markRead` skips the write when already caught up | 1 (own user listener) per actual write |
| Typing / presence | Not stored in Firestore | 0 |

**Per message sent**, each online member pays ~2 reads: the message doc (if the room is open) and the room doc change (room list). The sender's batch also costs 2 rule reads (`getAfter` of room and message).

**Security rules reads**: each message query/listener start costs 1 extra read (`get` of the room for the membership check), not 1 per message.

## Trade-offs

- **Room doc hot spot**: every message writes the room doc → about 1 sustained write/s per room. Fine for team chat; for very busy rooms, move the preview/counter update to a debounced Cloud Function.
- **Offline > 30 min**: Firestore re-bills a listener's full result set when it reconnects after 30 minutes. The incremental `sentAt >` listener keeps that result set small.
- **Edits to old messages** are picked up live only when made after the newest cached message (`editedAt >` listener). Older edits show when that page is next fetched from the server.
- **Room preview** keeps the original text after an edit/soft delete of the latest message.
- **Read cursors** (`users.reads`): rules check type and size only. A bad value only affects that user's own badges.
- **Roles**: no promote/demote operation yet; role is set when a member is added (only the owner can grant admin).
- **Deleting a room** does not delete its messages subcollection; they become unreadable (rules need the room doc). Use a Cloud Function or `firebase firestore:delete -r` to purge.
- **Rejected: message bucketing** (many messages per doc). It saves history reads, but it hits the 1 write/s per doc limit and the 1 MiB doc size limit, and it makes edits and deletes awkward.

## Indexes

- Composite `rooms`: `memberIds` CONTAINS + `lastMessageAt` DESC.
- Not indexed (never queried): `messages.text`, `rooms.members`, `rooms.lastMessage`, `users.reads`.

## Web app (Next.js 16.4, App Router)

Firebase Auth and Firestore are the only backend. The Next.js server serves prerendered shells only and never reads Firestore. The app uses Cache Components and Partial Prefetching, the 16.4 defaults.

| Route | Rendering | What it does |
|---|---|---|
| `/` | static | Sign in: Google or email/password |
| `/rooms` | static | Room list + empty state |
| `/rooms/[roomId]` | partial prerender (room id is only known at request time) | Messages, composer, members panel |

- `AuthProvider` (root layout) tracks `onAuthStateChanged`. `RequireAuth` redirects signed-out users to `/`. Segments always render, so Next can validate instant navigation.
- `ChatDataProvider` (rooms layout) owns the only two long-lived listeners: `subscribeMyRooms` and `subscribeMe`. The sidebar, room header, members panel and unread badges all read from it.
- `RoomView` adds one `subscribeMessages` for the open room only, and drops it when you leave.
- `markRead` runs only while the tab is visible, and is skipped when already caught up.
- No `'use cache'`: all data is per-user and realtime, and lives in the Firestore SDK's IndexedDB cache in the browser. Sidebar links keep the default prefetch (static shell only), so prefetching never costs Firestore reads.
- Members are added by user ID: each user copies theirs from the sidebar.

## Push notifications (FCM)

A member is notified when someone else writes in one of their rooms and they don't have a visible tab open on that room.

```
users/{uid}/devices/{sha256(token)}   { token, updatedAt }       owner-only (rules)
roomTokens/{roomId}                   { tokens: { uid: { deviceId: token } } }   server-only (rules deny all)
```

- **Client** (`src/lib/push.ts`, `PushToggle`): the "Notifications" toggle in the sidebar asks for permission, registers `public/firebase-messaging-sw.js` (scope `/`) and gets an FCM token using the default VAPID key. It stores the token as a device doc and rewrites it only when the token changes. Signing out deletes this browser's device doc.
- **`onRoomWritten`** (Cloud Function, `europe-west1`) fires on every room write:
  - On membership changes it adds or removes that user's devices in `roomTokens`.
  - When `messageCount` goes up it reads `roomTokens/{roomId}` (**1 read**) and sends a data-only multicast to every member's devices except the sender's.
  - It deletes dead tokens' device docs.
  - It rebuilds a missing `roomTokens` doc once from members' devices.
- **`onDeviceWritten`** fires when a device is added, refreshed or removed. It updates that user's entry in `roomTokens` for every room they're in (1 read per room, rare).
- **Service worker**: on push it skips the notification if any visible window is on `/rooms/{roomId}`. Otherwise it shows one notification per room (`tag`), and newer messages replace older ones. Clicking it focuses or opens the room.

Costs per message: 1 function invocation, plus 1 Firestore read and N FCM sends (FCM is free). The room-doc data comes free with the trigger event.

Limits: "not viewing" is decided per device, so a phone still buzzes while the same user reads the room on a laptop. iOS Safari only receives web push for a site added to the Home Screen.

## Code

- `src/firebase.ts`: app, auth, Firestore with persistent multi-tab cache.
- `src/chat/rooms.ts`: `createRoom`, `addMember`, `removeMember`, `renameRoom`, `deleteRoom`, `subscribeMyRooms`.
- `src/chat/messages.ts`: `sendMessage`, `editMessage`, `softDeleteMessage`, `subscribeMessages` → `{ unsubscribe, loadOlder }`.
- `src/chat/reads.ts`: `upsertProfile`, `subscribeMe`, `unreadCount`, `markRead`.
- `firestore.rules`: prototype rules; review before launch.
- `test/rules.test.ts`: emulator tests (`npm run test:rules`, needs Java 11+).
