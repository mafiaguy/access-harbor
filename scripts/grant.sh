#!/usr/bin/env bash
# Grant a user time-boxed access to a repo and record it in grants.json.
#
# Usage:
#   ORG=<org> GH_TOKEN=<token> scripts/grant.sh <username> <repo> <permission> <expiry YYYY-MM-DD>
#
# Env:
#   ORG        GitHub org / owner (required)
#   GH_TOKEN   token with Administration:write on the repo (required)
#   STATE      path to state file (default: grants.json)
#
# Local test (no commit; just calls the API + updates grants.json):
#   ORG=myorg GH_TOKEN=$(gh auth token) scripts/grant.sh alice my-repo push 2025-12-31
set -euo pipefail

USER_NAME="${1:?username required}"
REPO="${2:?repo required}"
PERMISSION="${3:?permission required (pull|triage|push|maintain|admin)}"
EXPIRY="${4:?expiry date required (YYYY-MM-DD)}"
STATE="${STATE:-grants.json}"
: "${ORG:?set ORG to your GitHub org/owner}"
: "${GH_TOKEN:?set GH_TOKEN to a token with Administration:write}"

# --- validate inputs -------------------------------------------------------
case "$PERMISSION" in
  pull|triage|push|maintain|admin) ;;
  *) echo "error: permission must be one of pull|triage|push|maintain|admin" >&2; exit 1 ;;
esac
if ! [[ "$EXPIRY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "error: expiry must be YYYY-MM-DD" >&2; exit 1
fi
if [[ "$EXPIRY" < "$(date -u +%F)" ]]; then
  echo "error: expiry $EXPIRY is in the past" >&2; exit 1
fi
[[ -f "$STATE" ]] || echo '[]' > "$STATE"

# --- grant -----------------------------------------------------------------
echo ">> granting $USER_NAME '$PERMISSION' on $ORG/$REPO until $EXPIRY"
gh api -X PUT "repos/$ORG/$REPO/collaborators/$USER_NAME" -f permission="$PERMISSION" >/dev/null

# --- record (state + audit) ------------------------------------------------
jq --arg u "$USER_NAME" --arg r "$REPO" --arg p "$PERMISSION" --arg e "$EXPIRY" \
   '. += [{user:$u, repo:$r, permission:$p, expiry:$e, granted:(now|todateiso8601)}]' \
   "$STATE" > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"

echo ">> recorded in $STATE"
