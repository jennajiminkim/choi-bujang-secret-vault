const CACHE='byte-back-public-shell-v1';
const PUBLIC=['/offline.html','/app-icon.svg','/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PUBLIC))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([
 caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('byte-back-public-shell-')&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 // Never intercept or cache API, Auth, tokens, approvals, note data, or bundles.
 if(url.origin!==self.location.origin||event.request.method!=='GET'||url.pathname.startsWith('/api/'))return;
 if(event.request.mode==='navigate'&&url.pathname==='/'){
  event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));return;
 }
 if(PUBLIC.includes(url.pathname)&&!url.search)event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
