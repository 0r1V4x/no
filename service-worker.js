const CACHE_NAME = 'coinflow-v2';
const DYNAMIC_CACHE = 'coinflow-dynamic-v2';
const API_CACHE = 'coinflow-api-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== DYNAMIC_CACHE && key !== API_CACHE)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - network first, then cache
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests - network first with timeout
  if (url.pathname.startsWith('/api/') || url.hostname.includes('firebase')) {
    event.respondWith(networkFirst(request));
  }
  // Static assets - cache first
  else if (request.destination === 'style' || request.destination === 'script' || request.destination === 'font') {
    event.respondWith(cacheFirst(request));
  }
  // Images - cache first with network fallback
  else if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request));
  }
  // HTML/Core - network first
  else {
    event.respondWith(networkFirst(request));
  }
});

// Cache strategies
async function cacheFirst(request) {
  const cached = await caches.match(request);
  return cached || fetch(request);
}

async function networkFirst(request) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('Network failed, falling back to cache', error);
    const cached = await caches.match(request);
    if (cached) return cached;
    
    if (request.mode === 'navigate') {
      return caches.match('/offline.html');
    }
    
    return new Response('Network error', { status: 408, statusText: 'Network error' });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cached = await cache.match(request);
  
  const networkPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);
  
  return cached || networkPromise;
}

// Background sync for offline actions
self.addEventListener('sync', event => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(processQueue());
  }
});

async function processQueue() {
  const db = await openDB();
  const queue = await db.getAll('queue');
  
  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body
      });
      
      if (response.ok) {
        await db.delete('queue', item.id);
        
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'QUEUE_PROCESSED',
            data: item
          });
        });
      }
    } catch (error) {
      console.error('Failed to process queue item:', error);
    }
  }
}

// Push notifications
self.addEventListener('push', event => {
  const data = event.data.json();
  
  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    },
    actions: [
      {
        action: 'open',
        title: 'Open App'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CoinFlowDB', 1);
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
