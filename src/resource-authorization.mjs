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

// A logical engine resource belongs to the subject namespace explicitly named in
// its ID. This is OUR policy convention, not an undocumented engine guarantee.
// Never claim a resource merely because its first request arrived from a subject.
export function isOwnLogicalResource(subjectId, id) {
  if (typeof subjectId !== 'string' || !subjectId || typeof id !== 'string') return false;
  return id === subjectId || (id.startsWith(`${subjectId}--`) && id.length > subjectId.length + 2);
}

export function authorizeServerResource(request, resource) {
  if (['classId', 'projectId', 'subjectId'].some(key => typeof request[key] !== 'string' || !request[key])) return false;
  if (request.queryLength !== 0) return false; // No unseen query may select an ID, owner or operation.
  if (resource.collection === 'notes') {
    if (request.path === '/api/notes' && resource.id === null) {
      return ['GET', 'POST'].includes(request.method);
    }
    if (request.path.startsWith('/api/notes/')) {
      // Grant entry to this exact owned-resource handler, NOT proof of row ownership.
      // Its final GET/PUT/DELETE always uses id AND owner_id = verified login ID.
      // Other users' rows are 404 regardless of this entry grant.
      return UUID.test(resource.id ?? '') && ['GET', 'PUT', 'DELETE'].includes(request.method);
    }
    // Bare engine collection /notes and ownerless opaque IDs have no ownership evidence.
    return ['GET', 'PUT'].includes(request.method) && isOwnLogicalResource(request.subjectId, resource.id);
  }
  // Readable notice zone; the final API authenticates the reader again.
  // No verified instructor role exists in the public engine request contract.
  // Instructor writes need an explicitly provided trusted grant, otherwise deny.
  return resource.collection === 'notices' && request.method === 'GET';
}
