// 서비스 워커: 앱 파일을 캐시해서 설치/빠른 실행 지원. Supabase 통신은 절대 가로채지 않음.
const VERSION = 'family-todo-v2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css', 'icons/icon.svg',
  'js/app.js', 'js/config.js', 'js/prefs.js', 'js/state.js', 'js/actions.js',
  'js/data/client.js', 'js/data/spaces.js', 'js/data/members.js', 'js/data/tasks.js', 'js/data/trips.js',
  'js/data/realtime.js', 'js/data/backup.js', 'js/data/food.js',
  'js/logic/dates.js', 'js/logic/recurrence.js', 'js/logic/filters.js', 'js/logic/share.js', 'js/logic/food.js',
  'js/ui/components.js', 'js/ui/sheet.js', 'js/ui/layout.js', 'js/ui/home.js', 'js/ui/tasks.js',
  'js/ui/trips.js', 'js/ui/taskForm.js', 'js/ui/settings.js', 'js/ui/gate.js', 'js/ui/food.js',
];
const CACHEABLE_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))) // HTTP 캐시를 거치지 않고 최신 파일로
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) return; // supabase.co 등은 그대로 통과

  // 캐시 먼저 보여주고, 뒤에서 최신 파일로 갱신
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: sameOrigin });
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
