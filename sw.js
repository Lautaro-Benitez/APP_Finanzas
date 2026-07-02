const CACHE_NAME = 'finanzapp-cache-3.6.0'; // Editado automáticamente por bump.js

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles/main.css',
    './js/app.js'
    // El resto se cacheará en tiempo de ejecución (on the fly)
];

self.addEventListener('install', (event) => {
    // Al instalar la nueva versión, pre-cacheamos los archivos clave.
    // NO llamamos a skipWaiting() aquí. Queremos que el usuario controle cuándo actualizar.
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    // Cuando el nuevo SW toma el control, borramos todas las cachés viejas (las de versiones anteriores)
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Estrategia Cache-First (Offline First). 
    // Busca en caché, si no está va a red, y si hay éxito lo guarda en caché.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                if (event.request.method === 'GET' && networkResponse.status === 200 && !event.request.url.startsWith('chrome-extension')) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Falla silenciosa si no hay red y no está en caché
            });
        })
    );
});

// Escuchar mensaje del cliente para saltarse la espera y actualizar
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
