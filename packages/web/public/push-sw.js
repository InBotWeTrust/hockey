self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'Ultimate Hockey';
  const options = {
    body: payload.body || 'Проверка уведомлений',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    silent: Boolean(payload.silent),
    tag: payload.tag || 'ultimate-hockey-test-push',
    data: {
      url: payload.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client && client.url === targetUrl) {
          return client.focus();
        }
      }
      for (const client of clients) {
        if ('focus' in client && 'navigate' in client) {
          return client.navigate(targetUrl).then((navigatedClient) => {
            return navigatedClient ? navigatedClient.focus() : client.focus();
          });
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
