const CACHE_NAME = 'finanzapp-pwa-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Para que la app siga comprobando la versión en vivo y no rompa el actualizador
    // usamos una estrategia Network First básica.
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
