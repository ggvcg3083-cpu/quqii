// sw.js - Chill OS 离线信使 (Service Worker)

self.addEventListener('install', (event) => {
  console.log('[Chill OS] 离线信使安装成功 ✦');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Chill OS] 离线信使已激活 ✦');
  event.waitUntil(self.clients.claim());
});

// 监听云端发来的离线推送信号！
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    
    // 配置手机弹出的通知卡片样式
    const options = {
      body: payload.body || '发来了一条新消息',
      icon: payload.icon || 'apple-touch-icon.png',
      badge: 'apple-touch-icon.png',
      vibrate: [200, 100, 200], // 震动两下
      data: {
        url: payload.url || '/' // 点击通知后跳转的地址
      }
    };

    // 唤起系统级通知！
    event.waitUntil(
      self.registration.showNotification(payload.title || 'Chill OS', options)
    );
  } catch (err) {
    console.error('[Chill OS] 解析推送数据失败:', err);
  }
});

// 监听用户点击通知的动作
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // 点击后自动关掉通知小卡片

  // 用户点击后，自动唤醒并打开 Chill OS 网页
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 如果网页已经在后台挂着，就把它拉回前台
      for (let client of windowClients) {
        if (client.url.includes(event.notification.data.url) && 'focus' in client) {
          return client.focus();
        }
      }
      // 如果网页已经被彻底杀掉了，就重新打开一个新窗口
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
// 监听页面发来的本地通知指令（前台保活时的后台提醒）
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SHOW_NOTIFICATION') return;
  const { title, body, icon } = event.data;
  self.registration.showNotification(title || 'Chill OS', {
    body: body || '发来了一条新消息',
    icon: icon || 'apple-touch-icon.png',
    badge: 'apple-touch-icon.png',
    vibrate: [200, 100, 200],
    tag: event.data.tag || ('msg-' + Date.now()),
    renotify: true,
    data: { url: '/' }
  });
});