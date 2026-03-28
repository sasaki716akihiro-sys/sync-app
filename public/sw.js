// ─── Service Worker for Web Push Notifications ───────────────
// パートナーがキモチを入力したときにプッシュ通知を受信して表示する

self.addEventListener("push", (event) => {
  let data = { title: "ふたりのきもち", body: "パートナーからのメッセージがあります 🌸" };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // JSON parse失敗時はデフォルト値を使用
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "kimochi-nudge",       // 同じタグで重複しない
      renotify: false,
      data: { url: "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // すでに開いているタブがあればフォーカス
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        // なければ新しいタブで開く
        return clients.openWindow("/");
      })
  );
});
