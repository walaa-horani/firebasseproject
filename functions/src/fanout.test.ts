import { describe, expect, it } from 'vitest';
import { chunk, collectTargets, diffMembers, isDeadToken, newMessage, pushData, type RoomData } from './fanout';

const room = (over: Partial<RoomData> = {}): RoomData => ({
  name: 'General',
  memberIds: ['a', 'b', 'c'],
  members: { a: { name: 'Alice' }, b: { name: 'Bob' }, c: { name: 'Carol' } },
  lastMessage: null,
  messageCount: 0,
  ...over,
});

describe('diffMembers', () => {
  it('finds added and removed uids', () => {
    expect(diffMembers(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
    expect(diffMembers([], ['a'])).toEqual({ added: ['a'], removed: [] });
  });
});

describe('newMessage', () => {
  const msg = { id: 'm1', text: 'hi', senderId: 'a' };
  it('announces only when the counter goes up', () => {
    expect(newMessage(room(), room({ lastMessage: msg, messageCount: 1 }))).toEqual(msg);
    expect(newMessage(undefined, room({ lastMessage: msg, messageCount: 1 }))).toBeNull();
    // rename / membership change: counter unchanged
    expect(newMessage(room({ lastMessage: msg, messageCount: 1 }), room({ name: 'x', lastMessage: msg, messageCount: 1 }))).toBeNull();
  });
});

describe('collectTargets', () => {
  it('targets every device of every member except the sender and ex-members', () => {
    const tokens = { a: { d1: 't1' }, b: { d2: 't2', d3: 't3' }, z: { d9: 't9' } };
    expect(collectTargets(tokens, ['a', 'b', 'c'], 'a')).toEqual([
      { uid: 'b', deviceId: 'd2', token: 't2' },
      { uid: 'b', deviceId: 'd3', token: 't3' },
    ]);
  });
});

describe('pushData', () => {
  it('uses the sender name from the room members map', () => {
    const data = pushData('r1', room(), { id: 'm1', text: 'hi', senderId: 'b' });
    expect(data).toMatchObject({ roomId: 'r1', roomName: 'General', senderName: 'Bob', text: 'hi', type: 'message' });
    expect(Object.values(data).every((v) => typeof v === 'string')).toBe(true);
  });
});

describe('helpers', () => {
  it('detects dead tokens and chunks lists', () => {
    expect(isDeadToken('messaging/registration-token-not-registered')).toBe(true);
    expect(isDeadToken('messaging/internal-error')).toBe(false);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
