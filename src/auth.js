import * as oidc from 'openid-client';
import { randomBytes } from 'node:crypto';
import { UserError } from './access.js';

export function configureAuth(app, config) {
  let discovery;
  const getClient = () =>
    (discovery ||= discoverIdentity(config).catch((error) => {
      discovery = undefined;
      throw error;
    }));
  const regenerate = (req) =>
    new Promise((resolve, reject) =>
      req.session.regenerate((error) => (error ? reject(error) : resolve())),
    );
  app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', { title: 'Sign in' });
  });
  app.get('/auth/login', async (req, res) => {
    const client = await getClient();
    const verifier = oidc.randomPKCECodeVerifier(),
      state = oidc.randomState(),
      nonce = oidc.randomNonce();
    req.session.oidc = { verifier, state, nonce, started: Date.now() };
    const target = oidc.buildAuthorizationUrl(client, {
      redirect_uri: `${config.publicUrl}/auth/callback`,
      scope: 'openid email profile',
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    req.session.save((error) => {
      if (error) return res.status(500).send('Could not start sign-in.');
      res.redirect(target.href);
    });
  });
  app.get('/auth/callback', async (req, res) => {
    const state = req.session.oidc;
    if (!state || Date.now() - state.started > 600000)
      throw new UserError('Sign-in expired. Start again from the login page.', 403);
    delete req.session.oidc;
    const client = await getClient();
    const tokens = await oidc.authorizationCodeGrant(
      client,
      new URL(req.originalUrl, config.publicUrl),
      {
        pkceCodeVerifier: state.verifier,
        expectedState: state.state,
        expectedNonce: state.nonce,
        idTokenExpected: true,
      },
    );
    const claims = tokens.claims();
    if (!claims || claims.email_verified !== true || typeof claims.email !== 'string')
      throw new UserError('Your identity provider must supply a verified email.', 403);
    const enrolled = Object.hasOwn(config.identities, claims.sub)
      ? config.identities[claims.sub]
      : null;
    if (!enrolled || enrolled.email.toLowerCase() !== claims.email.toLowerCase())
      throw new UserError(
        'Your account is not enrolled. Ask an administrator to add your OIDC subject and verified email.',
        403,
      );
    await regenerate(req);
    req.session.user = {
      sub: claims.sub,
      email: claims.email,
      name: claims.name || enrolled.name || claims.email,
    };
    req.session.csrf = randomBytes(24).toString('hex');
    res.redirect('/');
  });
  app.post('/logout', (req, res, next) =>
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('harbor.sid');
      res.redirect('/login');
    }),
  );
}

export async function discoverIdentity(config) {
  const options = config.local
    ? {
        execute: [oidc.allowInsecureRequests],
        [oidc.customFetch]: (input, init) => {
          const url = new URL(input);
          if (url.origin !== new URL(config.oidcIssuer).origin)
            throw new Error('Local OIDC attempted an unexpected endpoint.');
          const endpoint = new URL(config.awsOptions.endpoint);
          url.protocol = endpoint.protocol;
          url.host = endpoint.host;
          return fetch(url, init);
        },
      }
    : undefined;
  return oidc.discovery(
    new URL(config.oidcIssuer),
    config.oidcClientId,
    config.oidcClientSecret,
    undefined,
    options,
  );
}
