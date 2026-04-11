// ─── Service Worker for Web Push Notifications ───────────────
// パートナーがキモチを入力したときにプッシュ通知を受信して表示する

// 新バージョンのSWを即時有効化（waiting状態をスキップ）
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// 有効化後、既存の全クライアントをこのSWが即座に制御
self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

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
      tag: "kimochi-update", // 固定タグで重複通知を1件に収束させる
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
