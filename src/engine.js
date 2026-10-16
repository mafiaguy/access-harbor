import { randomUUID } from 'node:crypto';
import { createMailSender } from './mail.js';
import { audit, mail, transaction } from './database.js';
import { providerFor, AccessConflict } from './providers/index.js';

export async function processRequest(
  db,
  config,
  initial,
  { now = Date.now, makeProvider = providerFor } = {},
) {
  const owner = randomUUID();
  const claimed = db
    .prepare(
      "UPDATE requests SET lease_owner=?,lease_until=? WHERE id=? AND lease_until<? AND retry_at<=? AND status IN ('provisioning','active','revoking')",
    )
    .run(owner, now() + 120000, initial.id, now(), now());
  if (!claimed.changes) return;
  const row = db.prepare('SELECT * FROM requests WHERE id=?').get(initial.id);
  const update = (sql, ...values) =>
    db.prepare(sql + ' WHERE id=? AND lease_owner=?').run(...values, row.id, owner);
  try {
    const provider = makeProvider(config, row);
    if (row.status === 'active') {
      if (row.expires_at > now()) return;
      update("UPDATE requests SET status='revoking'");
      row.status = 'revoking';
    }
    if (row.status === 'provisioning') {
      if (!row.owned) {
        await provider.preflight(row);
        row.expires_at = now() + row.days * 86400000;
        update('UPDATE requests SET owned=1,expires_at=?', row.expires_at);
        row.owned = 1;
      }
      // If an asynchronous grant is already in flight, finish observing it before revocation.
      if (row.expires_at <= now() && !row.operation_json) {
        update("UPDATE requests SET status='revoking',retry_at=0,error=NULL");
        return;
      }
      const result = await provider.step('grant', row);
      update(
        'UPDATE requests SET operation_json=?,retry_at=?,error=NULL,attempts=0',
        result.operation ? JSON.stringify(result.operation) : null,
        now() + 2000,
      );
      if (result.done) {
        const expired = row.expires_at <= now();
        transaction(db, () => {
          update('UPDATE requests SET status=?,retry_at=0', expired ? 'revoking' : 'active');
          audit(
            db,
            row.id,
            'system',
            expired
              ? 'Provisioning completed after deadline; revocation queued'
              : 'Access is ready',
            now(),
          );
          if (!expired)
            mail(
              db,
              row.email,
              `Access ready · Request #${row.id}`,
              `Your temporary access is ready. It expires at ${new Date(row.expires_at).toISOString()}. GitHub invitations may need accepting.\n\n${config.publicUrl}/`,
            );
        });
      }
    } else if (row.status === 'revoking') {
      const result = await provider.step('revoke', row);
      update(
        'UPDATE requests SET operation_json=?,retry_at=?,error=NULL,attempts=0',
        result.operation ? JSON.stringify(result.operation) : null,
        now() + 2000,
      );
      if (result.done)
        transaction(db, () => {
          const status = row.expires_at <= now() ? 'expired' : 'revoked';
          update('UPDATE requests SET status=?,retry_at=0', status);
          audit(
            db,
            row.id,
            'system',
            status === 'expired' ? 'Access expired and was removed' : 'Access removed early',
            now(),
          );
          mail(
            db,
            row.email,
            `Access removed · Request #${row.id}`,
            `Your temporary access has been removed.\n\n${config.publicUrl}/`,
          );
        });
    }
  } catch (error) {
    const safe =
      error instanceof AccessConflict
        ? error.message
        : 'Provider operation failed. Check worker logs and provider configuration; a retry is queued.';
    console.error(`Request #${row.id}: ${error.name}: ${error.message}`);
    transaction(db, () => {
      if (error instanceof AccessConflict && !row.owned) {
        update("UPDATE requests SET status='failed',error=?", safe);
        audit(
          db,
          row.id,
          'system',
          'Existing access detected; request stopped without changing permissions',
          now(),
        );
        mail(db, row.email, `Request #${row.id} needs attention`, safe);
      } else {
        if (error.retryOperation) update('UPDATE requests SET operation_json=NULL');
        const delay = Math.min(300000, 5000 * 2 ** Math.min(row.attempts, 6));
        update('UPDATE requests SET error=?,attempts=attempts+1,retry_at=?', safe, now() + delay);
        if (!row.error) {
          audit(db, row.id, 'system', 'Provider error; automatic retry scheduled', now());
          for (const admin of config.admins)
            mail(
              db,
              admin,
              `Action needed · Request #${row.id}`,
              `A provider operation failed. Access may still be present. Check the setup page and worker logs.\n\n${config.publicUrl}/setup`,
            );
        }
      }
    });
  } finally {
    update('UPDATE requests SET lease_until=0,lease_owner=NULL');
  }
}
export async function deliverMail(db, config, { now = Date.now, transport } = {}) {
  const sender = transport || createMailSender(config);
  const messages = db
    .prepare(
      'SELECT * FROM outbox WHERE sent_at IS NULL AND retry_at<=? AND lease_until<? ORDER BY id LIMIT 25',
    )
    .all(now(), now());
  for (const message of messages) {
    if (
      !db
        .prepare('UPDATE outbox SET lease_until=? WHERE id=? AND lease_until<? AND sent_at IS NULL')
        .run(now() + 60000, message.id, now()).changes
    )
      continue;
    try {
      await sender.sendMail({
        from: config.mailFrom,
        to: message.recipient,
        subject: message.subject,
        text: message.body,
      });
      db.prepare('UPDATE outbox SET sent_at=?,lease_until=0,error=NULL WHERE id=?').run(
        now(),
        message.id,
      );
    } catch {
      db.prepare(
        "UPDATE outbox SET attempts=attempts+1,retry_at=?,lease_until=0,error='Email delivery failed' WHERE id=?",
      ).run(now() + Math.min(300000, 5000 * 2 ** Math.min(message.attempts, 6)), message.id);
    }
  }
  sender?.close?.();
}
export async function tick(db, config, options = {}) {
  const now = options.now || Date.now;
  db.prepare("INSERT OR REPLACE INTO heartbeats VALUES('worker',?)").run(now());
  const rows = db
    .prepare(
      "SELECT * FROM requests WHERE (status IN ('provisioning','revoking') OR (status='active' AND expires_at<=?)) AND retry_at<=? AND lease_until<? ORDER BY CASE status WHEN 'revoking' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,id LIMIT 100",
    )
    .all(now(), now(), now());
  // Independent requests progress together. AWS polling never sleeps inside a job.
  for (let i = 0; i < rows.length; i += 5)
    await Promise.all(rows.slice(i, i + 5).map((row) => processRequest(db, config, row, options)));
  await deliverMail(db, config, options);
  db.prepare("INSERT OR REPLACE INTO heartbeats VALUES('worker',?)").run(now());
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now());
}
