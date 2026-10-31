// Web push handler for Team Chat. Handles FCM data messages directly (no
// Firebase SDK needed): FCM delivers them as JSON `{ data: {...}, ... }`.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function roomPath(roomId) {
  return `/rooms/${encodeURIComponent(roomId)}`;
}

self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    return;
  }
  const data = payload && payload.data;
  if (!data || data.type !== 'message') return;

  event.waitUntil(
    (async () => {
      // Skip when this person is looking at the room right now (a visible tab on it).
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const viewing = windows.some(
        (client) => client.visibilityState === 'visible' && new URL(client.url).pathname === roomPath(data.roomId),
      );
      if (viewing) return;

      await self.registration.showNotification(data.roomName || 'Team Chat', {
        body: `${data.senderName}: ${data.text}`,
        // One notification per room: newer messages replace older ones.
        tag: `room-${data.roomId}`,
        renotify: true,
        data: { url: roomPath(data.roomId) },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/rooms';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        await existing.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
