#!/usr/bin/env bash
# Sweep grants.json and revoke any access whose expiry date has passed.
# Access is valid THROUGH the expiry date; it is removed the day AFTER.
#
# Usage:
#   ORG=<org> GH_TOKEN=<token> scripts/expire.sh
#
# Env:
#   ORG        GitHub org / owner (required)
#   GH_TOKEN   token with Administration:write on the repos (required)
#   STATE      path to state file (default: grants.json)
#   DRY_RUN    set to 1 to print what would be revoked without calling the API
#
# Local dry run (safe, changes nothing):
#   ORG=myorg GH_TOKEN=$(gh auth token) DRY_RUN=1 scripts/expire.sh
set -euo pipefail

STATE="${STATE:-grants.json}"
: "${ORG:?set ORG to your GitHub org/owner}"
: "${GH_TOKEN:?set GH_TOKEN to a token with Administration:write}"
[[ -f "$STATE" ]] || { echo "no $STATE, nothing to do"; exit 0; }

TODAY="$(date -u +%F)"
KEPT='[]'
REVOKED=0

while IFS= read -r row; do
  [[ -z "$row" ]] && continue
  e=$(jq -r '.expiry' <<<"$row")
  u=$(jq -r '.user'   <<<"$row")
  r=$(jq -r '.repo'   <<<"$row")
  if [[ "$e" < "$TODAY" ]]; then                    # expiry strictly before today -> expired
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
      echo "DRY_RUN would revoke $u from $ORG/$r (expired $e)"
    else
      echo ">> revoking $u from $ORG/$r (expired $e)"
      gh api -X DELETE "repos/$ORG/$r/collaborators/$u" || echo "   (already gone / not a collaborator)"
    fi
    REVOKED=$((REVOKED+1))
  else
    KEPT=$(jq --argjson row "$row" '. += [$row]' <<<"$KEPT")
  fi
done < <(jq -c '.[]' "$STATE")

if [[ "${DRY_RUN:-0}" != "1" ]]; then
  echo "$KEPT" | jq '.' > "$STATE"
fi
echo ">> sweep $TODAY complete: $REVOKED expired, $(jq 'length' <<<"$KEPT") active"
