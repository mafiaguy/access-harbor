import express from 'express';
import { integrationRequirements } from './requirements.js';
import session from 'express-session';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { SQLiteSessionStore } from './database.js';
import { configureAuth } from './auth.js';
import { isAdmin, requestAccess, reviewRequest, stopAccess, present, UserError } from './access.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp(config, db) {
  const app = express();
  app.disable('x-powered-by');
  if (!config.local) app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          upgradeInsecureRequests: config.local ? null : [],
        },
      },
    }),
  );
  app.use(
    '/assets',
    express.static(path.join(root, 'public'), { maxAge: config.local ? 0 : '1h' }),
  );
  app.set('view engine', 'ejs');
  app.set('views', path.join(root, 'views'));
  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', (_req, res) => {
    const heartbeat = db.prepare("SELECT at FROM heartbeats WHERE name='worker'").get();
    const overdue = db
      .prepare(
        "SELECT COUNT(*) AS count FROM requests WHERE owned=1 AND status IN ('active','provisioning','revoking') AND expires_at<?",
      )
      .get(Date.now() - 60000).count;
    const ready = !!heartbeat && Date.now() - heartbeat.at < 120000 && overdue === 0;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'needs-attention',
      worker: !!heartbeat && Date.now() - heartbeat.at < 120000,
      overdue,
    });
  });
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use(
    session({
      name: 'harbor.sid',
      secret: config.secret,
      store: new SQLiteSessionStore(db),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.secureCookies,
        maxAge: 8 * 3600000,
      },
    }),
  );
  app.use((req, res, next) => {
    req.session.csrf ||= randomBytes(24).toString('hex');
    res.locals.config = { local: config.local, mode: config.mode, publicUrl: config.publicUrl };
    res.locals.user = req.session.user;
    res.locals.admin = isAdmin(config, req.session.user);
    res.locals.csrf = req.session.csrf;
    res.locals.currentPath = req.path;
    res.locals.flash = req.session.flash;
    delete req.session.flash;
    res.locals.date = (value) =>
      value
        ? new Intl.DateTimeFormat('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'UTC',
          }).format(value) + ' UTC'
        : 'Starts after approval';
    res.locals.statusLabel = (status) =>
      ({
        pending: 'Awaiting approval',
        provisioning: 'Setting up access',
        active: 'Access ready',
        revoking: 'Removing access',
        expired: 'Expired',
        revoked: 'Removed early',
        denied: 'Denied',
        cancelled: 'Cancelled',
        failed: 'Needs attention',
      })[status] || status;
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'POST') {
      const token = typeof req.body.csrf === 'string' ? req.body.csrf : '';
      const a = Buffer.from(token),
        b = Buffer.from(req.session.csrf);
      if (a.length !== b.length || !timingSafeEqual(a, b))
        return next(new UserError('This form has expired. Reload the page and try again.', 403));
    }
    next();
  });
  configureAuth(app, config);
  app.get('/guide', (_req, res) => res.render('guide', { title: 'How it works' }));
  app.use((req, res, next) => (req.session.user ? next() : res.redirect('/login')));
  app.get('/', (req, res) => {
    const rows = db
      .prepare('SELECT * FROM requests WHERE subject=? ORDER BY created_at DESC')
      .all(req.session.user.sub)
      .map(present);
    res.render('home', { title: 'My access', rows });
  });
  app.get('/request', (req, res) =>
    res.render('request', { title: 'Request access', resources: config.resources }),
  );
  app.post('/requests', (req, res) => {
    const id = requestAccess(db, config, req.session.user, req.body);
    req.session.flash = {
      message: `Request #${id} sent. An administrator will review it.`,
      kind: 'success',
    };
    res.redirect(`/requests/${id}`);
  });
  app.get('/requests/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM requests WHERE id=?').get(Number(req.params.id) || 0);
    if (!row || (row.subject !== req.session.user.sub && !isAdmin(config, req.session.user)))
      throw new UserError('Request not found.', 404);
    const events = db.prepare('SELECT * FROM audit WHERE request_id=? ORDER BY id').all(row.id);
    res.render('detail', { title: `Request #${row.id}`, row: present(row), events });
  });
  app.post('/requests/:id/stop', (req, res) => {
    stopAccess(db, config, req.session.user, Number(req.params.id));
    req.session.flash = { message: 'Your request has been updated.', kind: 'success' };
    res.redirect(`/requests/${Number(req.params.id)}`);
  });
  app.use(['/approvals', '/setup'], (req, _res, next) =>
    isAdmin(config, req.session.user)
      ? next()
      : next(new UserError('Only administrators can open this page.', 403)),
  );
  app.get('/approvals', (_req, res) => {
    const rows = db
      .prepare(
        "SELECT * FROM requests ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,created_at DESC",
      )
      .all()
      .map(present);
    res.render('approvals', { title: 'Review requests', rows });
  });
  app.post('/approvals/:id/:action', (req, res) => {
    reviewRequest(
      db,
      config,
      req.session.user,
      Number(req.params.id),
      req.params.action,
      req.body.note,
    );
    req.session.flash = {
      message: `Request #${Number(req.params.id)} ${req.params.action === 'approve' ? 'approved' : 'denied'}.`,
      kind: 'success',
    };
    res.redirect('/approvals');
  });
  app.get('/setup', (_req, res) => {
    const heartbeat = db.prepare("SELECT at FROM heartbeats WHERE name='worker'").get();
    const checks = [
      {
        name: 'Sign-in',
        ok: true,
        description: 'OIDC is configured. Your current session verifies sign-in works.',
      },
      {
        name: 'Administrators',
        ok: config.admins.length > 0,
        description: `${config.admins.length} approval recipient(s) configured.`,
      },
      {
        name: 'Resources',
        ok: config.resources.length > 0,
        description: `${config.resources.length} resources in the catalog. Provider access still needs a real smoke test.`,
      },
      {
        name: 'Expiry worker',
        ok: !!heartbeat && Date.now() - heartbeat.at < 120000,
        description: heartbeat
          ? `Last check: ${new Date(heartbeat.at).toISOString()}`
          : 'Start the worker with npm run worker.',
      },
      {
        name: 'Email',
        ok: config.mailTransport === 'ses' || !!config.smtp.host,
        description:
          config.mailTransport === 'ses'
            ? 'Email is submitted to SES; local deployments use Floci SES.'
            : 'SMTP configured. Check actual delivery before rollout.',
      },
    ];
    const issues = db
      .prepare('SELECT id,error,status FROM requests WHERE error IS NOT NULL ORDER BY id DESC')
      .all();
    const pendingMail = db
      .prepare('SELECT count(*) AS count FROM outbox WHERE sent_at IS NULL')
      .get().count;
    const failedMail = db
      .prepare('SELECT count(*) AS count FROM outbox WHERE error IS NOT NULL AND sent_at IS NULL')
      .get().count;
    res.render('setup', {
      title: 'Environment setup',
      checks,
      issues,
      pendingMail,
      failedMail,
      requirements: integrationRequirements(config),
    });
  });
  app.use((_req, _res, next) => next(new UserError('Page not found.', 404)));
  app.use((error, req, res, _next) => {
    const expected = error instanceof UserError;
    if (!expected) console.error('Web request failed:', error.name, error.message);
    res.status(expected ? error.status : 500).render('error', {
      title: 'Something needs attention',
      message: expected
        ? error.message
        : 'We could not complete that action. Try again or ask your administrator to check the server logs.',
    });
  });
  return app;
}
