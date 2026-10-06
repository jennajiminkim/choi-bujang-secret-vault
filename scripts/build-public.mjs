import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
if (config.step !== 4) {
  throw new Error('현재 빌드는 4단계 소유자 보호 흐름을 기대합니다. aleph.config.json의 step을 확인하세요.');
}

await mkdir(resolve(root, 'public'), { recursive: true });
await writeFile(
  resolve(root, 'public', 'data.json'),
  `${JSON.stringify({ notes: [] }, null, 2)}\n`,
  'utf8'
);
console.log('공개 data.json에는 메모를 포함하지 않습니다.');

if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(
    resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`,
    'utf8'
  );
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}

await build({ entryPoints: [resolve(root, 'src/browser-app.mjs')], outfile: resolve(root, 'public/assets/app.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'none' });
console.log('공식 Supabase SDK와 로그인 화면 코드를 빌드했습니다.');
