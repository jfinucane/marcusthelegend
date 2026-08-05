#!/usr/bin/env bash
# Deploy the "Block scanner probe paths" WAF custom rule to the marcusthelegend.com zone.
#
# Idempotent: reads the existing http_request_firewall_custom entrypoint ruleset,
# drops any rule with the same description, appends the current one, and PUTs the
# merged list back. Safe to re-run after editing EXPRESSION below.
#
# Requires CLOUDFLARE_API_TOKEN (backend/.env) with **Zone > WAF > Edit** on this zone.
# Rationale and traffic evidence: docs/traffic_history/week_ending_04-08-2025.md

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZONE_ID="bc7ada28985c60498a3b9f0e0158e519"
RULE_DESC="Block scanner probe paths (PHP/WordPress/.env/.git)"
PHASE="http_request_firewall_custom"
API="https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets"

# The app is a React SPA + Flask JSON API: no PHP, no WordPress, no dotfiles served.
# Every pattern below is therefore unambiguously a probe (verified against a week of
# nginx logs: 10,828 matches, 0 legitimate requests).
#
# url_decode() is essential — 2,363 requests last week used %2e encoding ("/%2eenv",
# "/index%2ephp") specifically to evade naive path matching.
#
# NOTE: the zone is on the **Free** plan, where the regex `matches` operator is not
# available (Business+ only). Everything here uses `contains`, which is sufficient:
# `contains ".php"` also covers the `.php7` / `.php1` / `.php.orig` variants scanners use.
P='lower(url_decode(http.request.uri.path))'
EXPRESSION="\
$P contains \".php\" or \
$P contains \"/wp-\" or \
$P contains \"wp-includes\" or \
$P contains \"wp-content\" or \
$P contains \"wp-admin\" or \
$P contains \"xmlrpc\" or \
$P contains \"wlwmanifest\" or \
$P contains \"/.env\" or \
$P contains \"/.git\" or \
$P contains \"/vendor/phpunit\" or \
$P contains \"/cgi-bin/\" or \
$P contains \"/actuator/\" or \
$P contains \"/_ignition/\""

TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' "$REPO_ROOT/backend/.env" | cut -d= -f2- \
        | sed "s/^[\"']//; s/[\"']\$//" | tr -d ' \r\n')
[ -n "$TOKEN" ] || { echo "CLOUDFLARE_API_TOKEN not found in backend/.env" >&2; exit 1; }

echo "Fetching current $PHASE entrypoint..."
CURRENT=$(curl -sS -H "Authorization: Bearer $TOKEN" "$API/phases/$PHASE/entrypoint")

PAYLOAD=$(CURRENT="$CURRENT" RULE_DESC="$RULE_DESC" EXPRESSION="$EXPRESSION" python3 <<'PY'
import json, os, sys

cur = json.loads(os.environ["CURRENT"])
if not cur.get("success"):
    errs = cur.get("errors") or []
    # 10003 = no entrypoint ruleset in this phase yet. That is the expected state on a
    # zone with no custom rules; the PUT below creates it. Anything else is fatal.
    if not any(e.get("code") == 10003 for e in errs):
        print("Cloudflare API error:", json.dumps(errs, indent=2), file=sys.stderr)
        sys.exit(1)
    cur = {"result": {"rules": []}}

desc = os.environ["RULE_DESC"]
rules = cur.get("result", {}).get("rules") or []
kept = [
    {k: r[k] for k in ("action", "expression", "description", "enabled") if k in r}
    for r in rules
    if r.get("description") != desc
]
kept.append({
    "action": "block",
    "expression": os.environ["EXPRESSION"],
    "description": desc,
    "enabled": True,
})
print(json.dumps({"rules": kept}))
PY
)

echo "Applying ruleset..."
curl -sS -X PUT \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data "$PAYLOAD" "$API/phases/$PHASE/entrypoint" \
| python3 -c '
import json, sys
d = json.load(sys.stdin)
if not d.get("success"):
    print("FAILED:", json.dumps(d.get("errors"), indent=2))
    sys.exit(1)
for r in d["result"].get("rules", []):
    print("  [%s] %s  id=%s" % (r.get("action"), r.get("description"), r.get("id")))
print("OK")
'
