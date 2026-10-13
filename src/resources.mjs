// IDs label resource zones; they never claim ownership from a UUID or URL.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const functions = new Set(['export', 'import', 'search', 'bulk', 'admin', 'all']);
export function apiResourceId(zone, id) {
  if (!['notes', 'notices'].includes(zone)) throw new Error('Unknown resource zone');
  return id === undefined ? `${zone}:collection` : UUID.test(id ?? '') ? `${zone}:${id.toLowerCase()}` : `${zone}:invalid`;
}
// Logical IDs remain generic for engine fixtures. UUID validation belongs to APIs.
const ZONES = Object.freeze([
  {name: 'materials', services: ['materials', 'instructors'], bases: ['/materials', '/api/materials', '/instructors', '/api/instructors'], methods: []},
  {name: 'announcements', services: ['announcements', 'notices'], bases: ['/announcements', '/api/announcements', '/notices', '/api/notices'], methods: ['GET']},
  {name: 'notes', services: ['notes'], bases: ['/notes', '/api/notes'], methods: ['GET', 'PUT']},
]);
const belongsTo = (path, base) => typeof path === 'string' && (path === base || path.startsWith(`${base}/`));
export function resourceZone(request) {
  // Reserved zone paths cannot become notes through a different service label.
  return ZONES.find(zone => zone.services.includes(request?.service)
    || zone.bases.some(base => belongsTo(request?.path, base)))?.name ?? null;
}
export function matchResource(request) {
  const zone = ZONES.find(entry => entry.name === resourceZone(request));
  if (!zone || !zone.services.includes(request?.service) || !zone.methods.includes(request.method)
      || typeof request.subjectId !== 'string' || !request.subjectId.trim()
      || request.queryLength !== 0
      || request.querySha256 !== 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      || typeof request.path !== 'string') return null;
  for (const base of zone.bases) {
    if (!request.path.startsWith(`${base}/`)
        || request.route !== `${request.method} ${base}/:id`) continue;
    const id = request.path.slice(base.length + 1);
    if (ID.test(id) && !functions.has(id.toLowerCase())) {
      return {zone: zone.name, id, resourceId: `${zone.name}:${id}`};
    }
  }
  return null;
}
