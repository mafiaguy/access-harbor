import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { parseEnv } from 'node:util';

// Optional real-container smoke check, using only the isolated Floci test configuration.
export async function checkContainers(directory) {
  const image = process.env.CONTAINER_TEST_IMAGE;
  if (!image) return;
  const docker = process.env.DOCKER_BIN || 'docker';
  const prefix = `harbor-integration-${randomBytes(5).toString('hex')}`;
  const names = [prefix + '-web', prefix + '-worker'];
  const dockerEnv = path.join(directory, 'docker.env');
  const metadata = parseEnv(fs.readFileSync(path.join(directory, '.env'), 'utf8'));
  fs.writeFileSync(
    dockerEnv,
    Object.entries(metadata)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
  const run = (args) => execFileSync(docker, args, { encoding: 'utf8', timeout: 60000 });
  const common = [
    '--rm',
    '--network',
    process.env.FLOCI_DOCKER_NETWORK || 'access-harbor_default',
    '--env-file',
    dockerEnv,
    '-e',
    'HOST=0.0.0.0',
    '-e',
    'FLOCI_ENDPOINT=http://floci:4566',
    '-e',
    'CATALOG_PATH=/app/config/catalog.json',
    '-e',
    'IDENTITIES_PATH=/app/config/identities.json',
    '-e',
    'DATABASE_PATH=/app/data/local.sqlite',
  ];
  try {
    run([
      'run',
      '-d',
      ...common,
      '--name',
      names[0],
      '-p',
      '127.0.0.1::3000',
      '--mount',
      `type=bind,src=${path.join(directory, 'config')},dst=/app/config,readonly`,
      '--mount',
      'type=volume,dst=/app/data',
      image,
    ]);
    run([
      'run',
      '-d',
      ...common,
      '--name',
      names[1],
      '--volumes-from',
      names[0],
      image,
      'node',
      'src/worker.js',
    ]);
    const port = run(['port', names[0], '3000/tcp']).trim().split(':').at(-1);
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health/ready`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready)
      throw new Error(
        'Web/worker containers did not reach readiness with Floci-backed configuration.',
      );
    const response = await fetch(`http://127.0.0.1:${port}/login`);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes('Continue with company sign-in'));
  } finally {
    try {
      run(['rm', '-f', names[1], names[0]]);
    } catch {}
  }
}
