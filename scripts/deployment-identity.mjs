const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPO = /^[A-Za-z0-9._-]{1,100}$/u;
const SHA = /^[a-f0-9]{40}$/iu;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/iu;

export function deploymentIdentity(env, config) {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const repo = env.VERCEL_GIT_REPO_SLUG;
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const host = env.VERCEL_URL;
  if (env.VERCEL_GIT_PROVIDER !== 'github' || !OWNER.test(owner || '')
      || !REPO.test(repo || '') || repo === '.' || repo === '..'
      || repo.toLowerCase().endsWith('.git') || !SHA.test(commit || '')
      || !HOST.test(host || '') || ![5, 6, 7, 8, 9, 10, 11, 12].includes(config?.step)
      || typeof config.judgeIssuer !== 'string'
      || !/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/defense\/judge$/iu.test(config.judgeIssuer)
      || typeof config.sampleMarker !== 'string'
      || !/^[A-Z0-9_]{1,80}$/u.test(config.sampleMarker)) {
    throw new Error('배포 식별 정보를 확인할 수 없습니다. Vercel 시스템 환경변수와 5~12단계 설정을 확인하세요.');
  }
  // VERCEL_URL identifies an individual deployment, which may have an SSO wall.
  // Advertise the configured public app URL used by the browser and JWT audience.
  let publicApp;
  try {
    publicApp = new URL(config.publicAppUrl === undefined ? `https://${host}` : config.publicAppUrl);
    if (publicApp.protocol !== 'https:' || !HOST.test(publicApp.hostname)
        || publicApp.username || publicApp.password || publicApp.port
        || publicApp.pathname !== '/' || publicApp.search || publicApp.hash) throw new Error();
  } catch {
    throw new Error('aleph.config.json의 publicAppUrl에 공개 자료실의 쿼리 없는 HTTPS 주소를 지정하세요.');
  }
  return {
    schema: 'aleph.defense.deployment.v1',
    step: config.step,
    repoUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    commit: commit.toLowerCase(),
    publicAppUrl: publicApp.origin,
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
    allowedRoutes: config.allowedRoutes,
    originalApiUrl: config.originalApiUrl,
    ...(config.step >= 10 ? {restoreRoute: config.restoreRoute} : {}),
  };
}
