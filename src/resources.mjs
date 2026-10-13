export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const FEATURE_IDS = new Set(['export', 'import', 'download', 'backup', 'bulk', 'all', 'admin', 'search', 'dump', 'sync', 'list', 'users']);

// Exact routes: IDs never share a slot with export/actions. Query has no operation selector.
export function classifyResource(request) {
  if (request?.queryLength !== 0) return null;
  for (const [collection, service, listMethods, itemMethods] of [
    ['notes', 'notes', ['GET', 'POST'], ['GET', 'PUT', 'DELETE']],
    ['notices', 'notices', ['GET'], ['GET', 'PUT']],
  ]) {
    if (request?.service !== service) continue;
    for (const base of [`/${collection}`, `/api/${collection}`]) {
      if (request.path === base && request.route === `${request.method} ${base}` && listMethods.includes(request.method)) {
        return { collection, id: null, resourceId: `${collection}:list` };
      }
      if (typeof request.path !== 'string' || !request.path.startsWith(`${base}/`)
          || request.route !== `${request.method} ${base}/:id` || !itemMethods.includes(request.method)) continue;
      const id = request.path.slice(base.length + 1);
      if (RESOURCE_ID.test(id) && !FEATURE_IDS.has(id.toLowerCase())) {
        const canonical = UUID.test(id) ? id.toLowerCase() : id;
        return { collection, id: canonical, resourceId: `${collection}:${canonical}` };
      }
    }
  }
  return null;
}

export function apiResourceId(collection, id) {
  return id === undefined ? `${collection}:list` : typeof id === 'string' && UUID.test(id) ? `${collection}:${id.toLowerCase()}` : `${collection}:unknown`;
}
