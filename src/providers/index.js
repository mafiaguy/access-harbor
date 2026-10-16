import { GitHubProvider } from './github.js';
import { AWSProvider } from './aws.js';
export { AccessConflict } from './errors.js';
export function providerFor(config, row) {
  const resource = JSON.parse(row.resource_json),
    identity = JSON.parse(row.identity_json);
  if (resource.provider === 'github') return new GitHubProvider(config, resource, identity);
  if (resource.provider === 'aws') return new AWSProvider(config, resource, identity);
  throw new Error('Unsupported provider.');
}
