// Pure helpers for push fan-out (no Firebase imports, unit-tested).

/** roomTokens/{roomId}.tokens: uid -> deviceId -> FCM token. */
export type TokenMap = Record<string, Record<string, string>>;

export interface LastMessage {
  id: string;
  text: string;
  senderId: string;
}

export interface RoomData {
  name: string;
  memberIds: string[];
  members?: Record<string, { name?: string }>;
  lastMessage: LastMessage | null;
  messageCount: number;
}

export interface Target {
  uid: string;
  deviceId: string;
  token: string;
}

export function diffMembers(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const prev = new Set(before);
  const next = new Set(after);
  return {
    added: after.filter((uid) => !prev.has(uid)),
    removed: before.filter((uid) => !next.has(uid)),
  };
}

/** The message that this room update announces, if any (counter went up). */
export function newMessage(before: RoomData | undefined, after: RoomData): LastMessage | null {
  if (!before || !after.lastMessage) return null;
  return after.messageCount > before.messageCount ? after.lastMessage : null;
}

/** Every device of every current member except the sender. */
export function collectTargets(tokens: TokenMap, memberIds: string[], senderId: string): Target[] {
  const targets: Target[] = [];
  for (const uid of memberIds) {
    if (uid === senderId) continue;
    for (const [deviceId, token] of Object.entries(tokens[uid] ?? {})) {
      targets.push({ uid, deviceId, token });
    }
  }
  return targets;
}

/** FCM data payload (all values must be strings). */
export function pushData(roomId: string, room: RoomData, msg: LastMessage): Record<string, string> {
  return {
    type: 'message',
    roomId,
    roomName: room.name,
    messageId: msg.id,
    senderId: msg.senderId,
    senderName: room.members?.[msg.senderId]?.name ?? 'Someone',
    text: msg.text,
  };
}

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export function isDeadToken(code: string | undefined): boolean {
  return code !== undefined && DEAD_TOKEN_CODES.has(code);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
