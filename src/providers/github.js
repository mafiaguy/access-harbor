import { sign } from 'node:crypto';
import { AccessConflict } from './errors.js';

export class GitHubProvider {
  constructor(config, resource, identity, fetcher = fetch) {
    this.config = config;
    this.resource = resource;
    this.username = identity.github_username;
    this.fetch = fetcher;
    if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(this.username || ''))
      throw new Error('Invalid enrolled GitHub username.');
  }
  async token() {
    if (this.installationToken) return this.installationToken;
    const now = Math.floor(Date.now() / 1000);
    const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iat: now - 60, exp: now + 540, iss: this.config.githubAppId })}`;
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(unsigned),
      this.config.githubPrivateKey,
    ).toString('base64url');
    const response = await this.call(
      'POST',
      `/app/installations/${this.resource.installation_id}/access_tokens`,
      undefined,
      `${unsigned}.${signature}`,
    );
    this.installationToken = response.body.token;
    if (!this.installationToken) throw new Error('GitHub did not return an installation token.');
    return this.installationToken;
  }
  async call(method, path, body, token) {
    const response = await this.fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token || (await this.token())}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    if (![200, 201, 204, 404].includes(response.status))
      throw new Error(
        `GitHub returned HTTP ${response.status}. Check the App installation and repository permissions.`,
      );
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  }
  base() {
    return `/repos/${this.resource.repository}`;
  }
  async invitations() {
    const matches = [];
    for (let page = 1; ; page++) {
      const result = await this.call('GET', `${this.base()}/invitations?per_page=100&page=${page}`);
      if (result.status !== 200)
        throw new Error('GitHub repository or invitation list is unavailable.');
      matches.push(
        ...result.body.filter(
          (i) => i.invitee?.login?.toLowerCase() === this.username.toLowerCase(),
        ),
      );
      if (result.body.length < 100) return matches;
    }
  }
  async preflight() {
    const result = await this.call(
      'GET',
      `${this.base()}/collaborators/${this.username}/permission`,
    );
    if (result.status === 200 && result.body.permission !== 'none')
      throw new AccessConflict(
        'This user already has repository access. Existing access is left untouched.',
      );
    if ((await this.invitations()).length)
      throw new AccessConflict(
        'An existing repository invitation was found. It is left untouched.',
      );
  }
  async step(action, row) {
    if (action === 'grant') {
      const result = await this.call('PUT', `${this.base()}/collaborators/${this.username}`, {
        permission: row.permission,
      });
      if (![201, 204].includes(result.status))
        throw new Error('GitHub could not grant repository access.');
    } else {
      for (const invitation of await this.invitations())
        await this.call('DELETE', `${this.base()}/invitations/${invitation.id}`);
      await this.call('DELETE', `${this.base()}/collaborators/${this.username}`);
    }
    return { done: true, operation: null };
  }
}
