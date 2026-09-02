#!/usr/bin/env bash
# Deploy the "Block scanner probe paths" WAF custom rule to the marcusthelegend.com zone.
#
# Idempotent: reads the existing http_request_firewall_custom entrypoint ruleset,
# drops any rule with the same description, appends the current one, and PUTs the
# merged list back. Safe to re-run after editing EXPRESSION below.
#
# Requires CLOUDFLARE_API_TOKEN (backend/.env) with **Zone > WAF > Edit** on this zone.
# Rationale and traffic evidence: docs/traffic_history/ (newest file first).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZONE_ID="bc7ada28985c60498a3b9f0e0158e519"
RULE_DESC="Block scanner probe paths (PHP/WordPress/config/secrets)"
# Descriptions this rule has been deployed under before. The merge below drops these
# too, so renaming the rule replaces the live one instead of stacking a second copy.
LEGACY_DESCS="Block scanner probe paths (PHP/WordPress/.env/.git)"
PHASE="http_request_firewall_custom"
API="https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets"

# The app is a React SPA + Flask JSON API: no PHP, no WordPress, no dotfiles, no
# config or secret files served from any path. Every pattern below is therefore
# unambiguously a probe.
#
# url_decode() is essential — scanners encode the dot (`/%2eenv`, `/index%2ephp`)
# specifically to evade naive path matching, and some double-encode the slash too
# (`/%2fstripe%2eenv`), which one decode pass flattens into a match.
#
# NOTE: the zone is on the **Free** plan, where the regex `matches` operator is not
# available (Business+ only). Everything here uses `contains`, which is sufficient
# and is why the terms are deliberately unanchored: `contains "php"` covers
# `.php7`, `/php/`, and `php-cgi.exe` alike.
#
# THE GUARD IS LOAD-BEARING. Vite names its output chunks after the source module
# they came from, so a future `frontend/src/config.js` would ship as
# `/assets/config-<hash>.js` and the `config` term would block the app's own
# JavaScript. Everything Vite emits lives under `/assets/`, so excluding that one
# prefix makes the term list safe to widen. The cost is ~8 probes a month that
# nginx answers off disk anyway.
#
# Before editing the term list, run:  python3 scripts/verify_waf_expression.py
# It replays the terms against every real route and against a month of nginx logs.
#
# Two terms are broader than today's app and will need revisiting if it grows:
#   config / settings — would block a future `/api/config` or `/api/settings` route
#   /api/v1/ /api/v2/ — would block a future versioned API prefix
P='lower(url_decode(http.request.uri.path))'

# PHP / WordPress family — deployed 2026-08-05 in #32, cut origin scanner traffic
# from ~1,900/day to near zero. See docs/traffic_history/week_ending_2026-08-25.md.
PHP_FAMILY="\
$P contains \"php\" or \
$P contains \"/wp-\" or \
$P contains \"wp-includes\" or \
$P contains \"wp-content\" or \
$P contains \"wp-admin\" or \
$P contains \"xmlrpc\" or \
$P contains \"wlwmanifest\" or \
$P contains \"vendor/phpunit\" or \
$P contains \"cgi-bin\" or \
$P contains \"actuator\" or \
$P contains \"_ignition\""

# Config / secret discovery family — added 2026-08-27 for TASKS.md P14. The #32
# expression used \"/.env\", which missed the named variants scanners actually use
# (`/sendgrid.env`, `/prod.env`, `/aws.env`); \".env\" catches those.
#
# It does NOT catch bare `/api/env` — there is no dot, so no `.env` term can match.
# Verified live 2026-09-02: `/api/env` returns 404 from the origin, not a 403 from
# the edge. Covering it needs either an anchored \"/api/env\" term or a bare \"env\",
# and `env` is a risky substring to block unanchored. Left uncovered deliberately:
# 13 requests in 31 days, all 404. See TASKS.md P14 for the open decision.
SECRET_FAMILY="\
$P contains \".env\" or \
$P contains \".git\" or \
$P contains \".aws\" or \
$P contains \"secret\" or \
$P contains \"credential\" or \
$P contains \"passwd\" or \
$P contains \"password\" or \
$P contains \"appsetting\" or \
$P contains \"config\" or \
$P contains \"settings\" or \
$P contains \"terraform\" or \
$P contains \"tfvars\" or \
$P contains \"webhook\" or \
$P contains \"/api/v1/\" or \
$P contains \"/api/v2/\""

# File extensions the app never serves. (.js/.json/.css are excluded — it does.)
BACKUP_EXTENSIONS="\
$P contains \".yml\" or \
$P contains \".yaml\" or \
$P contains \".ini\" or \
$P contains \".properties\" or \
$P contains \".sql\" or \
$P contains \".bak\" or \
$P contains \".old\" or \
$P contains \".pem\" or \
$P contains \".key\" or \
$P contains \".csv\""

EXPRESSION="($PHP_FAMILY or $SECRET_FAMILY or $BACKUP_EXTENSIONS) \
and not $P contains \"/assets/\""

# `--dry-run` prints the expression this script would deploy and stops. Use it with
# scripts/verify_waf_expression.py to review a term change before it goes live.
if [ "${1:-}" = "--dry-run" ]; then
    echo "$EXPRESSION"
    exit 0
fi

TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' "$REPO_ROOT/backend/.env" | cut -d= -f2- \
        | sed "s/^[\"']//; s/[\"']\$//" | tr -d ' \r\n')
[ -n "$TOKEN" ] || { echo "CLOUDFLARE_API_TOKEN not found in backend/.env" >&2; exit 1; }

echo "Fetching current $PHASE entrypoint..."
CURRENT=$(curl -sS -H "Authorization: Bearer $TOKEN" "$API/phases/$PHASE/entrypoint")

PAYLOAD=$(CURRENT="$CURRENT" RULE_DESC="$RULE_DESC" LEGACY_DESCS="$LEGACY_DESCS" \
          EXPRESSION="$EXPRESSION" python3 <<'PY'
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
stale = {desc} | {d for d in os.environ.get("LEGACY_DESCS", "").split("\n") if d}
rules = cur.get("result", {}).get("rules") or []
kept = [
    {k: r[k] for k in ("action", "expression", "description", "enabled") if k in r}
    for r in rules
    if r.get("description") not in stale
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
