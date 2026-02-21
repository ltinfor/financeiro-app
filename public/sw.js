const CACHE_NAME = 'financeiro-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/dashboard.js',
    '/logo.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    // Fallback cache -> API
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
