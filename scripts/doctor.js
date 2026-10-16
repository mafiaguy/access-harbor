import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/database.js';
import { providerFor, AccessConflict } from '../src/providers/index.js';
import { discoverIdentity } from '../src/auth.js';
let failures = 0;
async function check(name, fn) {
  try {
    console.log(`✓ ${name}: ${await fn()}`);
  } catch {
    failures++;
    console.error(`✗ ${name}: failed. Check service availability and workload permissions.`);
  }
}
try {
  const config = await loadConfig();
  console.log(`Access Harbor doctor · ${config.environment}`);
  console.log('✓ Secret bundle loaded from Secrets Manager; values are not displayed.');
  await check('Database', async () => {
    const db = openDatabase(config.databasePath, config.environment);
    db.close();
    return 'read/write available';
  });
  if (process.argv.includes('--online')) {
    await check('OIDC discovery', async () => {
      await discoverIdentity(config);
      return 'metadata reachable; actual sign-in still needs testing';
    });
    for (const resource of config.resources)
      await check(resource.name, async () => {
        const key = resource.provider === 'github' ? 'github_username' : 'aws_user_id';
        const identity = Object.values(config.identities).find((i) => i[key]);
        if (!identity) throw new Error();
        const row = {
          resource_json: JSON.stringify({ ...resource, instanceArn: config.awsInstanceArn }),
          identity_json: JSON.stringify(identity),
          permission: Object.keys(resource.permissions)[0],
        };
        try {
          await providerFor(config, row).preflight(row);
        } catch (error) {
          if (!(error instanceof AccessConflict)) throw error;
        }
        return 'provider reads passed; grant and removal still need a smoke test';
      });
  }
  console.log(
    'Next: sign in, submit a request, approve it using a different account, then verify provider grant and removal.',
  );
} catch (error) {
  failures++;
  console.error(error.message);
}
process.exitCode = failures ? 1 : 0;
