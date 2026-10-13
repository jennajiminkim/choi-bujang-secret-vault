// IDs label resource zones; they never claim ownership from a UUID or URL.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const functions = new Set(['export', 'import', 'search', 'bulk', 'admin', 'all']);
export function apiResourceId(zone, id) {
  if (!['notes', 'notices'].includes(zone)) throw new Error('Unknown resource zone');
  return id === undefined ? `${zone}:collection` : UUID.test(id ?? '') ? `${zone}:${id.toLowerCase()}` : `${zone}:invalid`;
}
// Policy admits one note only. Final API checks its stored owner atomically.
// Collection APIs still serve the browser, but are never admitted by this policy.
export function matchResource(request) {
  if (typeof request?.subjectId !== 'string' || !request.subjectId.trim()
      || request.service !== 'notes' || !['GET', 'PUT'].includes(request.method)
      || request.queryLength !== 0
      || request.querySha256 !== 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      || typeof request.path !== 'string') return null;
  for (const base of ['/notes', '/api/notes']) {
    if (!request.path.startsWith(`${base}/`)
        || request.route !== `${request.method} ${base}/:id`) continue;
    const id = request.path.slice(base.length + 1);
    if (ID.test(id) && !functions.has(id.toLowerCase())) {
      return {zone: 'notes', id, resourceId: `notes:${id}`};
    }
  }
  return null;
}
