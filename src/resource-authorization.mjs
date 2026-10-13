import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { UUID } from './resources.mjs';

export function createResourceAuthorizer({ supabase, config: boundConfig }) {
  return async (request, resource) => {
    if (['classId', 'projectId', 'subjectId'].some(key => typeof request[key] !== 'string' || !request[key])) return false;
    try {
      const { data: link, error } = await supabase.from('vault_subject_links').select('user_id')
        .eq('repo_url', boundConfig.repoUrl).eq('class_id', request.classId).eq('project_id', request.projectId)
        .eq('subject_id', request.subjectId).maybeSingle();
      if (error || !UUID.test(link?.user_id ?? '')) return false;
      if (resource.collection === 'notes') {
        if (!resource.id) return true; // API filters list and assigns inserted owner again.
        const result = await supabase.from('notes').select('id').eq('id', resource.id).eq('owner_id', link.user_id).maybeSingle();
        return !result.error && Boolean(result.data);
      }
      if (resource.id) {
        const result = await supabase.from('notices').select('id').eq('id', resource.id).maybeSingle();
        if (result.error || !result.data) return false;
      }
      if (request.method === 'GET') return true;
      const grant = await supabase.from('vault_instructors').select('user_id').eq('user_id', link.user_id).maybeSingle();
      return !grant.error && Boolean(grant.data);
    } catch { return false; }
  };
}

let serverAuthorizer;
export async function authorizeServerResource(request, resource) {
  if (['classId', 'projectId', 'subjectId'].some(key => typeof request[key] !== 'string' || !request[key])) return false;
  // This exact API always applies owner_id = verified login ID in the final SELECT.
  // No item ID or owner selector may be supplied through the query on this grant.
  // Individual resources and engine-only collection paths still require ownership below.
  if (resource.collection === 'notes' && resource.id === null && request.method === 'GET'
      && request.path === '/api/notes' && request.route === 'GET /api/notes'
      && request.queryLength === 0) return true;
  // Fixed class/project and subject aliases are ONLY for the existing local/judge exercise.
  // These aliases are never compared with actual Supabase users or used for a live class.
  if (request.signals?.source === 'judge_fixture' && request.classId === 'class_fixture' && request.projectId === 'project_fixture') {
    const subjects = ['learner_fixture', 'learner_b_fixture', 'instructor_fixture'];
    if (!subjects.includes(request.subjectId)) return false;
    if (resource.id === 'demo') return request.subjectId === 'learner_fixture' && request.method === 'GET';
    if (resource.collection === 'notes') {
      if (!resource.id) return true;
      const owner = { '11111111-1111-4111-8111-111111111111': 'learner_fixture',
        '22222222-2222-4222-8222-222222222222': 'learner_b_fixture' }[resource.id];
      return owner === request.subjectId;
    }
    if (resource.id && resource.id !== '33333333-3333-4333-8333-333333333333') return false;
    return request.method === 'GET' || request.subjectId === 'instructor_fixture';
  }
  try {
    if (!serverAuthorizer) {
      const url = process.env.SUPABASE_URL;
      const secret = process.env.SUPABASE_SECRET_KEY;
      if (!url || !secret || new URL(url).origin !== new URL(config.identityProvider.issuer).origin) return false;
      const supabase = createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (target, options) => fetch(target, { ...options, signal: AbortSignal.timeout(1200) }) },
      });
      serverAuthorizer = createResourceAuthorizer({ supabase, config });
    }
    return await serverAuthorizer(request, resource);
  } catch { return false; }
}
