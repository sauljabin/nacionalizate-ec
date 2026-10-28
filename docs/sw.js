"use strict";

// Service worker: keeps the whole site usable offline.
//
// - Page files and data/cards.json: network first, so updates arrive as soon
//   as there is a connection; the cached copy is used offline.
// - Images and the anthem audio: cache first. Everything is saved on
//   install (about 23 MB): question images, answer photos, the flag, the coat
//   of arms, the province map and the anthem.
// - Google Fonts: served from cache when available and refreshed in the
//   background.
//
// Bump VERSION when an image or the audio keeps its file name but changes
// its content.

const VERSION = "v5";
const CACHE = `examen-${VERSION}`;
const SHELL = [
  "./",
  "index.html",
  "app.js",
  "styles.css",
  "data/cards.json",
  "manifest.webmanifest",
  "icons/favicon-32.png",
  "icons/favicon-64.png",
  "icons/flag.png",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];
// Used by the learning pages (symbols and map), not by any question.
const PAGE_MEDIA = [
  "images/bandera.svg",
  "images/escudo.svg",
  "images/mapa-provincias.svg",
  "audio/himno-nacional.m4a",
];

async function questionMedia() {
  const response = await fetch("data/cards.json", { cache: "no-cache" });
  const data = await response.json();
  const files = new Set();
  for (const category of data.categories) {
    for (const sub of category.subcategories) {
      for (const card of sub.cards) {
        if (card.image) files.add(card.image.src);
        if (card.photo) files.add(card.photo.src);
      }
    }
  }
  return [...files];
}

// Asks the server whether the file changed instead of trusting the browser's
// HTTP cache (GitHub Pages keeps files for 10 minutes), so a new version never
// saves an old copy. It only skips that cache: offline copies still come from
// the service worker's own cache.
function fresh(src) {
  return new Request(src, { cache: "no-cache" });
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map(fresh));
    // A file that fails to download must not block the install: it is saved
    // the first time it is shown instead.
    const media = [...PAGE_MEDIA, ...await questionMedia()];
    await Promise.allSettled(media.map((src) => cache.add(fresh(src))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("examen-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    // Skip the browser's HTTP cache (GitHub Pages keeps files for 10
    // minutes), so a new page never runs with an old app.js.
    const response = await fetch(request.url, { cache: "no-cache" });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") return cache.match("index.html");
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") cache.put(request, response.clone());
  return response;
}

// The audio player asks for the file in parts (Range requests). The cache
// holds the whole file, so the part asked for is cut from it.
async function cachedMedia(request) {
  const cache = await caches.open(CACHE);
  let cached = await cache.match(request.url);
  if (!cached) {
    // Saved whole (without the Range header) so later parts come from cache.
    const response = await fetch(request.url);
    if (!response.ok) return fetch(request);
    await cache.put(request.url, response.clone());
    cached = response;
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
  if (!range) return cached;
  const body = await cached.blob();
  const start = range[1] ? Number(range[1]) : Math.max(0, body.size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), body.size - 1) : body.size - 1;
  if (start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${body.size}` } });
  }
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "audio/mp4",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${body.size}`,
      "Accept-Ranges": "bytes",
    },
  });
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request).then((response) => {
    if (response.ok || response.type === "opaque") cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request));
  } else if (url.origin === self.location.origin && url.pathname.includes("/audio/")) {
    event.respondWith(cachedMedia(request));
  } else if (url.origin === self.location.origin) {
    const isImage = request.destination === "image" || url.pathname.includes("/images/");
    event.respondWith(isImage ? cacheFirst(request) : networkFirst(request));
  }
});
