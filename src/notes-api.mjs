import { randomUUID } from 'node:crypto';
import { createLoginVerifier } from './verify-login.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const fields = 'id,title,content';
const noteJson = note => ({ id: note.id, title: note.title, body: note.content });

export function createNotesHandler({ config, supabase, judgeKeySet }) {
  const verify = createLoginVerifier({ config, supabaseClient: supabase, judgeKeySet });
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const user = await verify(req.headers.authorization);
    if (!user) return res.status(401).json({ error: '로그인이 필요하거나 인증이 만료되었습니다.' });
    const id = req.query?.id;
    if (id !== undefined && (typeof id !== 'string' || !UUID.test(id))) {
      return res.status(400).json({ error: '메모 ID는 UUID여야 합니다.' });
    }
    const allowed = id ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST'];
    if (!allowed.includes(req.method)) {
      res.setHeader('Allow', allowed.join(', '));
      return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
    }
    try {
      if (req.method === 'GET' && !id) {
        const { data, error } = await supabase.from('notes').select(fields)
          .eq('owner_id', user.userId).order('created_at', { ascending: false });
        if (error) return res.status(502).json({ error: '메모 목록을 읽을 수 없습니다.' });
        return res.status(200).json((data ?? []).map(noteJson));
      }
      if (req.method === 'GET') {
        // Stage 3 checks identity only. Per-note ownership is stage 4.
        const { data, error } = await supabase.from('notes').select(fields).eq('id', id).maybeSingle();
        if (error) return res.status(502).json({ error: '메모를 읽을 수 없습니다.' });
        if (!data) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
        return res.status(200).json(noteJson(data));
      }
      if (req.method === 'DELETE') {
        const { data, error } = await supabase.from('notes').delete().eq('id', id).select('id').maybeSingle();
        if (error) return res.status(502).json({ error: '메모를 삭제할 수 없습니다.' });
        if (!data) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
        return res.status(200).json({ id: data.id });
      }
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'JSON 요청이 필요합니다.' }); }
      }
      if (!body || Array.isArray(body) || typeof body.title !== 'string' || !body.title.trim()
          || body.title.length > 200 || typeof body.body !== 'string' || body.body.length > 10000) {
        return res.status(400).json({ error: '제목은 1~200자, 본문은 10,000자 이내로 입력해 주세요.' });
      }
      if (req.method === 'POST') {
        const newId = body.id === undefined ? randomUUID() : body.id;
        if (typeof newId !== 'string' || !UUID.test(newId)) return res.status(400).json({ error: '메모 ID는 UUID여야 합니다.' });
        // Only the verifier determines identity. Client userId, role and owner_id are ignored.
        const { data, error } = await supabase.from('notes').insert({
          id: newId, title: body.title.trim(), content: body.body, owner_id: user.userId,
        }).select('id').single();
        if (error?.code === '23505') return res.status(409).json({ error: '이미 사용 중인 메모 ID입니다.' });
        if (error) return res.status(502).json({ error: '메모를 추가할 수 없습니다. DB 이전 SQL 실행 여부를 확인해 주세요.' });
        return res.status(201).json({ id: data.id });
      }
      const { data, error } = await supabase.from('notes')
        .update({ title: body.title.trim(), content: body.body }).eq('id', id).select(fields).maybeSingle();
      if (error) return res.status(502).json({ error: '메모를 수정할 수 없습니다.' });
      if (!data) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
      return res.status(200).json(noteJson(data));
    } catch {
      return res.status(502).json({ error: '메모 요청을 처리할 수 없습니다.' });
    }
  };
}
