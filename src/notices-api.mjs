import { createLoginVerifier } from './verify-login.mjs';
import { UUID, apiResourceId } from './resources.mjs';

const noticeJson = row => ({ id: row.id, title: row.title, body: row.content });
export function createNoticesHandler({ config, supabase, judgeKeySet }) {
  const verify = createLoginVerifier({ config, supabaseClient: supabase, judgeKeySet });
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const user = await verify(req.headers?.authorization);
    if (!user) return res.status(401).json({ error: '로그인이 필요하거나 인증이 만료되었습니다.' });
    const id = req.query?.id;
    if (Object.keys(req.query ?? {}).some(key => key !== 'id') || (id !== undefined && (typeof id !== 'string' || !UUID.test(id)))) {
      return res.status(400).json({ error: '쿼리에는 UUID 자료 ID만 지정할 수 있습니다.' });
    }
    res.setHeader('X-Resource-Id', apiResourceId('notices', id));
    if (!['GET', 'PUT'].includes(req.method) || (req.method === 'PUT' && !id)) {
      res.setHeader('Allow', id ? 'GET, PUT' : 'GET');
      return res.status(405).json({ error: '지원하지 않는 공지 요청입니다.' });
    }
    try {
      if (req.method === 'GET') {
        let query = supabase.from('notices').select('id,title,content');
        const { data, error } = id ? await query.eq('id', id).maybeSingle() : await query.order('created_at', { ascending: false });
        if (error) return res.status(502).json({ error: '공지를 읽을 수 없습니다. 8단계 SQL 적용 여부를 확인해 주세요.' });
        if (id && !data) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
        return res.status(200).json(id ? noticeJson(data) : (data ?? []).map(noticeJson));
      }
      // Instructor status is server-stored; neither body.role nor signed student's user_metadata is used.
      const grant = await supabase.from('vault_instructors').select('user_id').eq('user_id', user.userId).maybeSingle();
      if (grant.error) return res.status(503).json({ error: '강사 권한 설정을 확인할 수 없습니다.' });
      if (!grant.data) return res.status(403).json({ error: '강사 권한이 필요합니다.', code: 'instructor_required' });
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['title', 'body'].includes(key))
          || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200
          || typeof body.body !== 'string' || body.body.length > 10000) {
        return res.status(400).json({ error: '수정에는 title과 body만 지정할 수 있습니다.' });
      }
      const { data, error } = await supabase.rpc('vault_update_notice', {
        p_actor_id: user.userId, p_notice_id: id, p_title: body.title.trim(), p_content: body.body,
      });
      if (error) return res.status(502).json({ error: '공지를 수정할 수 없습니다.' });
      // RPC repeats instructor permission at write time. An empty result cannot expose the notice.
      if (!Array.isArray(data) || data.length !== 1) return res.status(404).json({ error: '공지를 수정할 권한이 없거나 공지가 없습니다.' });
      return res.status(200).json(noticeJson(data[0]));
    } catch { return res.status(502).json({ error: '공지 요청을 처리할 수 없습니다.' }); }
  };
}
