// IDs label resource zones; they never claim ownership from a UUID or URL.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const functions = new Set(['export', 'import', 'search', 'bulk', 'admin', 'all']);
export function apiResourceId(zone, id) {
  if (!['notes', 'notices'].includes(zone)) throw new Error('Unknown resource zone');
  return id === undefined ? `${zone}:collection` : UUID.test(id ?? '') ? `${zone}:${id.toLowerCase()}` : `${zone}:invalid`;
}
export function matchResource(request) {
  if (typeof request?.subjectId !== 'string' || !request.subjectId.trim()) return null;
  for (const zone of ['notes', 'notices']) {
    if (request.service !== zone) continue;
    for (const base of [`/${zone}`, `/api/${zone}`]) {
      if (request.path === base && request.route === `${request.method} ${base}`) {
        const allowed = zone === 'notes' ? ['GET', 'POST'] : ['GET'];
        if (allowed.includes(request.method)) return {zone, id: null, resourceId: `${zone}:collection`};
      }
      if (typeof request.path !== 'string' || !request.path.startsWith(`${base}/`)
          || request.route !== `${request.method} ${base}/:id`) continue;
      const id = request.path.slice(base.length + 1);
      if (!ID.test(id) || functions.has(id.toLowerCase())) continue;
      const allowed = zone === 'notes' ? ['GET', 'PUT', 'DELETE'] : ['GET'];
      if (allowed.includes(request.method)) return {zone, id, resourceId: `${zone}:${id}`};
    }
  }
  return null;
}
