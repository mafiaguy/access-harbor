# github-repo-jit

Just-in-time repo access for a GitHub org, with **no frontend to build**. A person
requests access to a repo, one of your 1-2 approvers clicks approve, they get added
as a collaborator, and a daily job removes them once their expiry date passes.

It uses only native GitHub features: `workflow_dispatch` (the request form),
Environments + required reviewers (the approval gate), a GitHub App (the
grant/revoke identity — no long-lived PAT), a cron workflow (the auto-revoke),
and `grants.json` in git (state + audit log).

```
request  ->  human approval  ->  grant collaborator  ->  daily sweep  ->  revoke on expiry
 (form)     (env reviewers)        (App token)            (cron)          (App token)
```

---

## What you need

**On your machine (to run/test locally):**
- `git`
- `gh` — GitHub CLI, logged in (`gh auth login`)
- `jq`
- `bash`

**In GitHub (one-time setup):**
- An **org** (this manages collaborator access to org repos).
- A **GitHub App** owned by the org, installed on the repos you want to manage.
- One **repo to host this project** (your "ops" repo) — where these workflows,
  `grants.json`, and the approvals live.

---

## Setup (one-time)

### 1. Create the GitHub App
Org → Settings → Developer settings → GitHub Apps → **New GitHub App**.
- Repository permissions → **Administration: Read & write** (this is what allows
  adding/removing collaborators). Nothing else needed.
- Uncheck Webhook (not used).
- Create it, then **Generate a private key** (downloads a `.pem`).
- **Install App** → choose the repos you want JIT to manage (include this ops repo).
- Note the **App ID**.

### 2. Add the App credentials to the ops repo
Ops repo → Settings →
- **Secrets and variables → Actions → Variables** → `JIT_APP_ID` = the App ID.
- **Secrets and variables → Actions → Secrets** → `JIT_APP_KEY` = paste the full
  contents of the `.pem` file.

> Never commit the `.pem`. `.gitignore` already excludes `*.pem`.

### 3. Create the approval gate (your reviewers)
Ops repo → Settings → **Environments → New environment** → name it exactly
`access-approval`.
- Enable **Required reviewers** and add your **1-2 approvers**.
- (Optional) set a wait timer or restrict to specific branches.

That environment is your entire approval UI — GitHub shows approvers the native
"Review deployments" approve/reject button.

### 4. Push this repo
```bash
git init && git add . && git commit -m "jit repo access"
git remote add origin git@github.com:<ORG>/<OPS_REPO>.git
git push -u origin main
```

Done. No servers, no Lambda, no Identity Center.

---

## Daily use

**Request access** (requester needs write on the ops repo — see note below):
Actions tab → **request-repo-access** → Run workflow → fill username, repo,
permission, expiry. Or:
```bash
gh workflow run request-repo-access.yml \
  -f username=alice -f repo=payments-api -f permission=push -f expiry=2025-12-31
```
The run pauses; an approver approves; the collaborator is added and logged.

**Revoke** happens automatically. `expire-repo-access` runs daily at 03:00 UTC and
removes anyone whose `expiry` is before today. Run it manually any time from the
Actions tab to force a sweep.

**Audit** = `git log grants.json`. Every grant and sweep is a commit.

---

## Test locally before wiring it up

You can exercise the exact grant/revoke logic the workflows use, straight from your
machine, using your own `gh` token:

```bash
# safe dry run of the expiry sweep — prints what WOULD be revoked, changes nothing
ORG=<your-org> GH_TOKEN=$(gh auth token) DRY_RUN=1 scripts/expire.sh

# grant for real (your gh token needs admin on the repo)
ORG=<your-org> GH_TOKEN=$(gh auth token) scripts/grant.sh alice test-repo push 2025-12-31
cat grants.json

# put a past date in grants.json, then run the real sweep to see the revoke
ORG=<your-org> GH_TOKEN=$(gh auth token) scripts/expire.sh
```

Locally the scripts only touch the API and `grants.json` — they do not commit or
push (that part lives in the workflows).

---

## Notes / gotchas

- **Access is valid THROUGH the expiry date**; removal happens the day after.
  Want removal *on* the date? change `<` to `<=` in `scripts/expire.sh`.
- **Revoke granularity = cron frequency.** Daily = within 24h. Tighten the cron
  (`scripts/../expire-repo-access.yml`) for same-hour removal.
- **Who can request.** `workflow_dispatch` requires write on the ops repo. If
  requesters shouldn't have that, swap the trigger to an **issue form** (anyone can
  open an issue) and parse its fields into the same `scripts/grant.sh` call — the
  approval gate stays the same.
- **Org members vs outside collaborators.** For someone outside the org, the grant
  creates an invitation they must accept; the sweep removes/cancels accordingly.
- **The only real secret is `JIT_APP_KEY`.** Keep write access to the ops repo tight
  since approvals and state live there. No PAT is stored anywhere.
