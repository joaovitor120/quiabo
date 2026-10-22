// Service worker do Painel do Quiabo: guarda os arquivos do app para abrir rápido.
// Os dados (Supabase) sempre vêm da internet.
const VERSAO = "quiabo-v1";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js",
  "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const ehDoApp = url.origin === self.location.origin;
  const ehBiblioteca = ARQUIVOS.includes(req.url);
  if (!ehDoApp && !ehBiblioteca) return; // Supabase e o resto: direto para a rede

  if (ehBiblioteca) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
    return;
  }
  // Arquivos do app: rede primeiro (pega atualizações), cache se estiver sem sinal.
  e.respondWith(
    fetch(req)
      .then((resp) => {
        const copia = resp.clone();
        caches.open(VERSAO).then((c) => c.put(req, copia));
        return resp;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});
