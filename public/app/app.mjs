const status = document.getElementById('status');
const message = document.getElementById('message');
// No verified enrollment/status contract is available in the starter repository.
// An install event, click or online transition must never become approval.
function showStatus() {
  status.textContent = navigator.onLine
    ? '기기 확인 연결 준비 중 · 승인 상태를 확인하지 못했습니다.'
    : '오프라인 · 기기를 확인할 수 없어 보호 자료를 표시하지 않습니다.';
}
document.getElementById('request').addEventListener('click', () => {
  message.textContent = '승인 서버가 연결되지 않아 요청을 접수하지 않았습니다. 기기 설정을 바꾸거나 패스키를 만들 필요는 없습니다.';
});
window.addEventListener('online', showStatus);
window.addEventListener('offline', showStatus);
showStatus();
let installPrompt;
const install = document.getElementById('install');
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event; install.hidden = false;
});
install.addEventListener('click', async () => {
  if (!installPrompt) return;
  try { await installPrompt.prompt(); }
  catch { message.textContent = '설치하지 못했습니다. 브라우저에서 준비 화면을 사용할 수 있습니다.'; }
  finally { installPrompt = null; install.hidden = true; }
});
window.addEventListener('appinstalled', () => {
  install.hidden = true;
  message.textContent = '앱 화면을 설치했습니다. 기기 승인은 완료되지 않았습니다.';
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(() => {
  message.textContent = '오프라인 안내를 준비하지 못했습니다. 온라인에서만 이 화면을 사용하세요.';
});
