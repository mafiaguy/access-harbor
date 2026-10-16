import { audit, mail, transaction } from './database.js';

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function isAdmin(config, user) {
  return !!user && config.admins.includes(user.email.toLowerCase());
}
export function requestAccess(db, config, user, input, now = Date.now()) {
  const resource = config.resources.find((r) => r.id === input.resource);
  const days = Number(input.days);
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!resource || !Object.hasOwn(resource.permissions, input.permission))
    throw new UserError('Choose an available resource and access level.');
  if (!Number.isInteger(days) || days < 1 || days > 30)
    throw new UserError('Choose a duration from 1 to 30 whole days.');
  if (reason.length < 10 || reason.length > 2000)
    throw new UserError('Give a reason between 10 and 2,000 characters.');
  const identity = config.identities[user.sub];
  if (!identity)
    throw new UserError('Your identity has not been enrolled. Ask an administrator.', 403);
  if (!identity[resource.provider === 'github' ? 'github_username' : 'aws_user_id'])
    throw new UserError(
      `Ask an administrator to map your ${resource.provider === 'github' ? 'GitHub username' : 'AWS Identity Center user ID'} first.`,
    );
  const snapshot = {
    ...resource,
    ...(resource.provider === 'aws'
      ? { instanceArn: config.awsInstanceArn, portalUrl: config.awsPortalUrl }
      : {}),
  };
  return transaction(db, () => {
    if (
      db
        .prepare(
          "SELECT id FROM requests WHERE subject=? AND resource_id=? AND status IN ('pending','provisioning','active','revoking')",
        )
        .get(user.sub, resource.id)
    )
      throw new UserError('You already have an open request for this resource.', 409);
    const id = Number(
      db
        .prepare(
          "INSERT INTO requests(subject,email,name,resource_id,resource_json,identity_json,permission,reason,days,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,'pending',?)",
        )
        .run(
          user.sub,
          user.email,
          user.name,
          resource.id,
          JSON.stringify(snapshot),
          JSON.stringify(identity),
          input.permission,
          reason,
          days,
          now,
        ).lastInsertRowid,
    );
    audit(db, id, user.email, 'Access requested', now);
    for (const email of config.admins)
      mail(
        db,
        email,
        `Review request #${id} · Access Harbor`,
        `${user.name} (${user.email}) requests ${resource.permissions[input.permission]} on ${resource.name} for ${days} day(s).\n\n${reason}\n\nReview: ${config.publicUrl}/approvals`,
      );
    return id;
  });
}
export function reviewRequest(db, config, user, id, action, note = '', now = Date.now()) {
  if (!isAdmin(config, user)) throw new UserError('Only administrators can review requests.', 403);
  if (!['approve', 'deny'].includes(action)) throw new UserError('Unknown decision.');
  return transaction(db, () => {
    const row = db.prepare('SELECT * FROM requests WHERE id=?').get(id);
    if (!row) throw new UserError('Request not found.', 404);
    if (row.subject === user.sub)
      throw new UserError('Another administrator must review your own request.', 403);
    if (row.status !== 'pending')
      throw new UserError('This request has already been reviewed.', 409);
    const status = action === 'approve' ? 'provisioning' : 'denied';
    db.prepare(
      'UPDATE requests SET status=?,reviewer=?,decision_note=?,approved_at=? WHERE id=?',
    ).run(status, user.email, String(note).slice(0, 2000), now, id);
    audit(
      db,
      id,
      user.email,
      action === 'approve' ? 'Approved; setting up access' : 'Request denied',
      now,
    );
    mail(
      db,
      row.email,
      `Request #${id} ${action === 'approve' ? 'approved' : 'denied'} · Access Harbor`,
      `Your request has been ${action === 'approve' ? 'approved and queued for provisioning' : 'denied'}.\n${String(note).slice(0, 2000)}\n\n${config.publicUrl}/`,
    );
  });
}
export function stopAccess(db, config, user, id, now = Date.now()) {
  return transaction(db, () => {
    const row = db.prepare('SELECT * FROM requests WHERE id=?').get(id);
    if (!row || (row.subject !== user.sub && !isAdmin(config, user)))
      throw new UserError('Request not found.', 404);
    const status =
      row.status === 'pending' ? 'cancelled' : row.status === 'active' ? 'revoking' : null;
    if (!status)
      throw new UserError('Only pending requests and active access can be stopped here.', 409);
    db.prepare('UPDATE requests SET status=?,retry_at=0 WHERE id=?').run(status, id);
    audit(
      db,
      id,
      user.email,
      status === 'cancelled' ? 'Request cancelled' : 'Early revocation requested',
      now,
    );
  });
}
export function present(row) {
  const resource = JSON.parse(row.resource_json);
  return {
    ...row,
    resource,
    permissionLabel: resource.permissions[row.permission],
    events: undefined,
  };
}
