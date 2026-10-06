import { createClient } from '@supabase/supabase-js';

const el = id => document.getElementById(id);
let supabase;
let signedIn = false;
let editId = null;
let generation = 0;
const message = text => { el('message').textContent = text; };
function resetEditor() {
  editId = null;
  el('note-form').reset();
  el('editor-heading').textContent = '새 가상 메모';
  el('save-button').textContent = '메모 추가';
  el('cancel-button').hidden = true;
}
function showSession(session) {
  generation++;
  signedIn = Boolean(session);
  el('login-panel').hidden = signedIn;
  el('workspace').hidden = !signedIn;
  el('auth-status').textContent = signedIn ? '로그인했습니다. 내 메모를 사용할 수 있습니다.' : '로그아웃 상태입니다. 자료를 보려면 로그인하세요.';
  el('notes').replaceChildren();
  resetEditor();
  if (!signedIn) el('password').value = '';
}
async function api(path = '', options = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('로그인이 필요합니다.');
  const response = await fetch(`/api/notes${path}`, {
    ...options, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
  });
  let body;
  try { body = await response.json(); } catch { throw new Error('자료 서버가 JSON 응답을 반환하지 않았습니다.'); }
  if (!response.ok) {
    if (response.status === 401) showSession(null);
    throw new Error(body.error || '자료 요청을 처리하지 못했습니다.');
  }
  return body;
}
async function refreshNotes() {
  const current = generation;
  if (!signedIn) return;
  try {
    const notes = await api();
    if (current !== generation || !signedIn) return;
    if (!Array.isArray(notes)) throw new Error('메모 목록 형식이 맞지 않습니다.');
    const items = notes.map(note => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      const body = document.createElement('span');
      title.textContent = note.title;
      body.textContent = note.body;
      const actions = document.createElement('div'); actions.className = 'actions';
      const edit = document.createElement('button'); edit.className = 'secondary'; edit.textContent = '수정';
      edit.addEventListener('click', () => {
        editId = note.id; el('title').value = note.title; el('body').value = note.body;
        el('editor-heading').textContent = '가상 메모 수정'; el('save-button').textContent = '수정 저장';
        el('cancel-button').hidden = false; el('title').focus();
      });
      const remove = document.createElement('button'); remove.className = 'danger'; remove.textContent = '삭제';
      remove.addEventListener('click', async () => {
        if (!confirm('이 가상 메모를 삭제할까요?')) return;
        remove.disabled = true;
        const version = generation;
        try {
          await api(`/${encodeURIComponent(note.id)}`, { method: 'DELETE' });
          if (version !== generation) return;
          if (editId === note.id) resetEditor();
          message('메모를 삭제했습니다.'); await refreshNotes();
        } catch (error) { message(error.message); } finally { remove.disabled = false; }
      });
      actions.append(edit, remove); item.append(title, body, actions); return item;
    });
    if (!items.length) { const item = document.createElement('li'); item.textContent = '아직 내 메모가 없습니다. 위에서 첫 가상 메모를 추가하세요.'; items.push(item); }
    el('notes').replaceChildren(...items);
  } catch (error) { if (current === generation) message(error.message); }
}
const authReasons = {
  invalid_credentials: '이메일 또는 비밀번호가 올바르지 않습니다.',
  email_not_confirmed: '이메일 인증을 먼저 완료해 주세요.',
  over_request_rate_limit: '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.',
  user_banned: '사용이 제한된 계정입니다.',
};
el('login-form').addEventListener('submit', async event => {
  event.preventDefault(); el('login-button').disabled = true; message('로그인하는 중입니다.');
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: el('email').value.trim(), password: el('password').value });
    el('password').value = '';
    if (error) { message(authReasons[error.code] || '로그인 서버에 연결할 수 없습니다. 계정 및 프로젝트 설정을 확인해 주세요.'); return; }
    showSession(data.session); message('로그인했습니다.'); await refreshNotes();
  } catch { message('로그인 서버에 연결할 수 없습니다.'); }
  finally { el('password').value = ''; el('login-button').disabled = false; }
});
el('logout-button').addEventListener('click', async () => {
  el('logout-button').disabled = true;
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    showSession(null); message('로그아웃했습니다.');
  } catch { message('로그아웃에 실패했습니다. 잠시 뒤 다시 시도해 주세요.'); }
  finally { el('logout-button').disabled = false; }
});
el('note-form').addEventListener('submit', async event => {
  event.preventDefault(); el('save-button').disabled = true;
  const version = generation; const updating = Boolean(editId);
  try {
    await api(editId ? `/${encodeURIComponent(editId)}` : '', {
      method: editId ? 'PUT' : 'POST', body: JSON.stringify({ title: el('title').value, body: el('body').value }),
    });
    if (version !== generation) return;
    resetEditor(); message(updating ? '메모를 수정했습니다.' : '메모를 추가했습니다.'); await refreshNotes();
  } catch (error) { message(error.message); }
  finally { el('save-button').disabled = false; }
});
el('cancel-button').addEventListener('click', resetEditor);
el('refresh-button').addEventListener('click', refreshNotes);
try {
  const response = await fetch('/auth-config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error();
  const config = await response.json();
  if (typeof config.publishableKey !== 'string' || !config.publishableKey.startsWith('sb_publishable_')) throw new Error();
  supabase = createClient(config.url, config.publishableKey);
  supabase.auth.onAuthStateChange((_event, session) => {
    showSession(session);
    // Keep SDK operations outside its synchronous auth-state callback.
    if (session) setTimeout(refreshNotes, 0);
  });
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  showSession(data.session); el('login-button').disabled = false; await refreshNotes();
} catch {
  showSession(null); message('로그인 설정을 불러올 수 없습니다. 프로젝트의 공개 키와 주소를 확인해 주세요.');
}
