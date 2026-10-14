const CACHE='byte-back-session-app-public-v1';
const PUBLIC=['/app/offline.html','/app/icon-192.png','/app/icon-512.png','/app/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(PUBLIC))));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin||event.request.method!=='GET'||event.request.mode!=='navigate'||url.pathname!=='/')return;
 event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(c=>c.match('/app/offline.html'))));
});
