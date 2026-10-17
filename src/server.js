import express from 'express';
import fs from 'node:fs';
import { parseEnv } from 'node:util';
import helmet from 'helmet';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openDatabase } from './database.js';
import { createApp } from './app.js';

// An unavailable secret manager never starts a substitute app or grants access.
// Only a setup-required page is served until the real configuration can be loaded.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const startup = express();
startup.disable('x-powered-by');
startup.use(
  helmet({
    contentSecurityPolicy: {
      directives: { upgradeInsecureRequests: process.env.APP_ENV === 'local' ? null : [] },
    },
  }),
);
startup.use('/assets', express.static(path.join(root, 'public')));
startup.set('view engine', 'ejs');
startup.set('views', path.join(root, 'views'));
startup.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
startup.get('/health/ready', (_req, res) => res.status(503).json({ status: 'setup-required' }));
startup.get('/integration-guide', (_req, res) => res.render('integration-guide'));
startup.use((_req, res) => res.status(503).render('startup'));
let handler = startup,
  db,
  retry,
  stopping = false,
  reported = false;
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || (process.env.APP_ENV === 'local' ? '127.0.0.1' : '0.0.0.0');
const server = createServer((req, res) => handler(req, res)).listen(port, host, () =>
  console.log(`Access Harbor listening on port ${port}.`),
);
async function initialize() {
  try {
    const metadata = fs.existsSync('.env') ? parseEnv(fs.readFileSync('.env', 'utf8')) : {};
    const config = await loadConfig({ ...metadata, ...process.env });
    if (stopping) return;
    db = openDatabase(config.databasePath, config.environment);
    handler = createApp(config, db);
    console.log('Application configuration loaded from Secrets Manager.');
  } catch {
    if (!reported)
      console.error(
        'Setup required: application configuration is unavailable. Run npm run doctor for configuration diagnostics.',
      );
    reported = true;
    if (!stopping) retry = setTimeout(initialize, 10000);
  }
}
initialize();
function stop() {
  stopping = true;
  clearTimeout(retry);
  server.close(() => {
    db?.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
