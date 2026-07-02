const CACHE_NAME = 'finanzapp-cache';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. NUNCA cachear el archivo version.json para que siempre pregunte a internet
    if (url.pathname.includes('version.json')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 2. Para todo lo demás (HTML, CSS, JS, imágenes), usar CACHE-FIRST
    // Esto hace que la app abra rapidísimo y funcione offline, y permite que
    // el actualizador se dé cuenta de que está corriendo una versión vieja.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse; // Devolver desde caché si existe
            }
            return fetch(event.request).then((networkResponse) => {
                // Si no estaba en caché, pedir a internet y guardarlo para la próxima
                return caches.open(CACHE_NAME).then((cache) => {
                    if (event.request.method === 'GET' && networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                });
            }).catch(() => {
                // Si no hay internet y no está en caché, no hacer nada (falla silenciosa)
            });
        })
    );
});

// 3. Escuchar la orden de borrar la caché desde la página web
self.addEventListener('message', (event) => {
    if (event.data === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            console.log('Caché antigua eliminada con éxito. Lista para la nueva versión.');
        });
    }
});
