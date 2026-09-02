#!/usr/bin/env python3
"""Check the WAF expression in cloudflare_waf_rule.sh before deploying it.

The rule blocks on unanchored `contains` terms (the zone is on the Free plan, where
the regex `matches` operator is unavailable), so a term that is a little too broad
silently takes the app down for children who cannot report it. This replays the
expression the deploy script would actually send:

  1. against every route the app serves, which must produce zero matches;
  2. against real nginx traffic, to show what the change would have blocked.

Usage:
    python3 scripts/verify_waf_expression.py
    python3 scripts/verify_waf_expression.py --log <(docker logs marcusthelegend-nginx-1)
"""

import argparse
import collections
import pathlib
import re
import subprocess
import sys
import urllib.parse

REPO = pathlib.Path(__file__).resolve().parent.parent
DEPLOY_SCRIPT = REPO / "scripts" / "cloudflare_waf_rule.sh"

UID = "0c6f9e9e-1d1b-418a-b57f-665d30aa11e1"

# Every path the production stack serves: nginx static locations, the SPA's
# client-side routes (nginx falls back to index.html for these), and the Flask
# blueprints under /api. Keep in sync with nginx/conf.d/marcusthelegend.conf,
# frontend/src/main.jsx, and backend/app/routes/.
REAL_ROUTES = [
    # nginx + static
    "/", "/index.html", "/favicon.ico", "/favicon.png", "/apple-touch-icon.png",
    "/vite.svg", "/healthz",
    "/assets/index-a1b2c3d4.js", "/assets/index-a1b2c3d4.css",
    # Vite names chunks after their source module, so these are the shapes that a
    # future frontend/src/config.js or settings.js would ship as. They must survive.
    "/assets/config-9f8e7d6c.js", "/assets/settings-1a2b3c4d.js",
    "/assets/env-5e6f7a8b.js", "/assets/password-1122aabb.js",
    f"/static/images/{UID}.jpg", f"/static/images/{UID}.png",
    # SPA client routes
    "/login", "/worlds", f"/worlds/{UID}", f"/stories/{UID}",
    # API
    "/api/auth/login", "/api/translate", "/api/image-buckets",
    "/api/worlds", f"/api/worlds/{UID}",
    f"/api/worlds/{UID}/entities", f"/api/worlds/{UID}/stories",
    f"/api/stories/{UID}", f"/api/stories/{UID}/items",
    f"/api/stories/{UID}/items/reorder", f"/api/stories/{UID}/kokoro-tts",
    f"/api/stories/{UID}/kokoro-voice", f"/api/stories/{UID}/reset-chat",
    f"/api/items/{UID}", f"/api/entities/{UID}",
    # P3 will add this one; check it now so the rule does not pre-emptively block it.
    "/api/health",
]
REAL_ROUTES += [
    f"{base}/{verb}"
    for base in (f"/api/worlds/{UID}", f"/api/stories/{UID}",
                 f"/api/items/{UID}", f"/api/entities/{UID}")
    for verb in ("generate-image", "edit-image", "set-image", "upload-image")
]

# Traffic that matches one of these is the app being used, not a probe. Used only to
# score a log replay; REAL_ROUTES above is what actually gates the check.
LEGIT_LOG_PATH = re.compile(
    r"^(/|/index\.html|/vite\.svg|/favicon\.(ico|png)|/apple-touch-icon\.png|/healthz"
    r"|/assets/[^/]+|/static/images/[0-9a-f-]+\.(jpg|jpeg|png|webp)"
    r"|/login|/worlds(/[0-9a-f-]+)?|/stories/[0-9a-f-]+"
    r"|/api/(auth/login|translate|image-buckets)"
    r"|/api/(worlds|stories|items|entities)(/[0-9a-f-]+(/[a-z-]+)*)?)$"
)


def load_expression():
    """Ask the deploy script for the exact expression it would send."""
    out = subprocess.run([str(DEPLOY_SCRIPT), "--dry-run"],
                         capture_output=True, text=True, check=True)
    return out.stdout.strip()


def parse_expression(expr):
    """Split the expression into (block terms, guard terms).

    The expression is `(<term> or <term> ...) and not <field> contains "<guard>"`,
    so anything after the closing paren is an exclusion rather than a match.
    """
    head, _, tail = expr.partition(") and ")
    block = re.findall(r'contains "([^"]+)"', head)
    guard = re.findall(r'contains "([^"]+)"', tail)
    return block, guard


def blocks(path, block, guard):
    p = urllib.parse.unquote(path).split("?")[0].lower()
    if any(g in p for g in guard):
        return False
    return any(t in p for t in block)


def replay_log(handle, block, guard):
    legit = collections.Counter()
    blocked_legit = collections.Counter()
    blocked_probe = 0
    total = 0
    for line in handle:
        # log_format app: $remote_addr $host "$request" ...
        try:
            path = line.split('"')[1].split(" ")[1]
        except IndexError:
            continue
        total += 1
        decoded = urllib.parse.unquote(path).split("?")[0].lower()
        hit = blocks(path, block, guard)
        if LEGIT_LOG_PATH.match(decoded):
            legit[decoded] += 1
            if hit:
                blocked_legit[decoded] += 1
        elif hit:
            blocked_probe += 1
    return total, sum(legit.values()), blocked_legit, blocked_probe


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--log", help="nginx access log to replay (default: skip)")
    args = ap.parse_args()

    expr = load_expression()
    block, guard = parse_expression(expr)
    print(f"{len(block)} block terms, {len(guard)} guard term(s), "
          f"{len(expr)} chars (Cloudflare's limit is 4096)\n")

    failures = [r for r in REAL_ROUTES if blocks(r, block, guard)]
    if failures:
        print(f"FAIL — the rule would block {len(failures)} real route(s):")
        for r in failures:
            print(f"  {r}")
    else:
        print(f"OK — none of the {len(REAL_ROUTES)} real routes match.")

    if args.log:
        with open(args.log, errors="replace") as fh:
            total, legit, bad, probes = replay_log(fh, block, guard)
        print(f"\nLog replay: {total} requests, {legit} of them real app traffic.")
        print(f"  probe requests blocked:      {probes}")
        print(f"  app requests wrongly blocked: {sum(bad.values())}")
        for p, n in bad.most_common(10):
            print(f"    {n:6d}  {p}")
        if bad:
            failures.append("log replay")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
