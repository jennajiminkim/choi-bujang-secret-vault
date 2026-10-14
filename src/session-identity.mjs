const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
// Private key stays in this page's RAM. Never export, serialize or persist it.
export async function createSessionIdentity() {
  const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  const bytes=await crypto.subtle.exportKey('spki',key.publicKey);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return {privateKey:key.privateKey,publicKey:encode(bytes),fingerprint:[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('')};
}
export async function signSessionChallenge(identity,mode,challenge,origin=location.origin) {
  const message=JSON.stringify(['vault-session-v1',origin,mode,challenge,identity.fingerprint]);
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},identity.privateKey,new TextEncoder().encode(message));
  return {publicKey:identity.publicKey,signature:encode(signature)};
}
