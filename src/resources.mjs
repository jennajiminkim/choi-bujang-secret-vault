export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Exact routes: IDs never share a slot with export/actions. Query has no operation selector.
export function classifyResource(request, { fixtureDemo = false } = {}) {
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
      if (UUID.test(id)) return { collection, id: id.toLowerCase(), resourceId: `${collection}:${id.toLowerCase()}` };
      // The existing stage 6/7 exercise uses /notes/demo. Never enabled for live requests.
      if (fixtureDemo && collection === 'notes' && id === 'demo' && request.method === 'GET') {
        return { collection, id: 'demo', resourceId: 'notes:demo' };
      }
    }
  }
  return null;
}

export function apiResourceId(collection, id) {
  return id === undefined ? `${collection}:list` : typeof id === 'string' && UUID.test(id) ? `${collection}:${id.toLowerCase()}` : `${collection}:unknown`;
}
