# Team Chat

Realtime team chat built with Next.js 16.4 (App Router, Cache Components) on Firebase Auth + Cloud Firestore (Standard edition). The data model is designed for the fewest billed document reads. See [docs/data-model.md](docs/data-model.md).

Firebase project: `team-chat-walaa` (Firestore `(default)`, location `eur3`).

## Run

```bash
npm install
npm run dev          # http://localhost:3000
```

Sign in with Google or email/password. To add someone to a room, ask them for their user ID ("Copy my user ID" in the sidebar).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve the build |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run seed` | Create demo users, rooms and messages in the live project. The writes go through the security rules. Set `SEED_PASSWORD` to reuse the demo accounts |
| `npm run test:unit` | Unit tests for the push fan-out logic (`functions/src`) |
| `npm run deploy:functions` | Build and deploy Cloud Functions (push notifications; needs the Blaze plan) |
| `npm run test:rules` | Security-rules tests in the Firestore emulator (needs Java 11+) |
| `npm run rules:check` | Compile `firestore.rules` without deploying |
| `npm run deploy:firestore` | Deploy rules + indexes |

## Layout

```
src/app/            routes: / (sign in), /rooms, /rooms/[roomId]
src/components/     client UI: providers, sidebar, room view, members panel
src/chat/           Firestore data layer (rooms, messages, read cursors, types)
src/firebase.ts     lazy Firebase app/auth/Firestore (persistent cache in the browser)
src/lib/push.ts     FCM token registration (users/{uid}/devices)
public/firebase-messaging-sw.js  shows pushes unless that room is open
functions/          Cloud Functions: onRoomWritten (send pushes), onDeviceWritten (token cache)
firestore.rules     security rules (prototype, review before launch)
firestore.indexes.json
scripts/seed.mjs    demo data
test/rules.test.ts  rules unit tests
```
