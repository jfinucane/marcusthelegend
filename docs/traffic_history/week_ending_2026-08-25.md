# Traffic review — three weeks ending 2026-08-25

**Period:** Wed 2026-08-05 00:00 UTC → Mon 2026-08-25 23:59 UTC (21 days)
**Source:** `docker logs marcusthelegend-nginx-1` — nginx sits behind the Cloudflare
Tunnel and in front of gunicorn/Flask, so it sees every request that reaches the origin.
**Zone:** `marcusthelegend.com` — Cloudflare **Free** plan.
**Previous review:** [`week_ending_04-08-2025.md`](week_ending_04-08-2025.md) (data is from
2026-08-04; the `2025` in that filename is a typo). This file starts the ISO convention
`week_ending_<YYYY-MM-DD>.md`. Covers three weeks rather than one because the reviews
lapsed after the WAF rule shipped.

---

## Headline: the #32 WAF rule works, completely

The rule went live 2026-08-05. Counting every request that reached the origin **through
Cloudflare** from 2026-08-06 onward:

```
requests matching the #32 rule's own terms, at the origin, per day

2026-07-27  ████                                   103
2026-07-28  ███████████████████████                655
2026-07-29  ████████████████████████████████████  1,910
2026-07-30  ███████████████████████████████████   2,096   rule deployed 08-05 ─┐
2026-07-31  ████████████████████████████████████  3,730                        │
2026-08-01  ████████████████████████                698                        │
...                                                                            │
2026-08-06  ·                                          0  ←────────────────────┘
2026-08-07 … 2026-08-25                                0
```

**14,367 requests arrived via Cloudflare in the 20 days after deployment. Zero matched
the rule's terms.** Nothing leaked; the block is at the edge and it holds.

## Volume

| | requests |
|---|---:|
| Origin requests, all entry points | 16,329 |
| — via `marcusthelegend.com` | 13,590 |
| — via `www.marcusthelegend.com` | 1,213 |
| — via `spark-b0aa.taileb1e78.ts.net` (tailnet) | 1,522 |
| — via `localhost` / `127.0.0.1` (local checks) | 4 |
| **Real app traffic** (SPA routes, assets, generated images, `/api` routes) | **2,420 (15%)** |
| Everything else | 13,909 (85%) |

Real usage runs 50–160 requests/day with two spikes (536 on 08-11, 254 on 08-20). Hostile
traffic is still 85% of what reaches the origin, but it is now a *different* 85%: the
PHP/WordPress flood is gone and what remains is config-discovery and long-tail scanning.

## The gap this review closes (TASKS.md P14)

Two families slip past the #32 expression. Both are the same class of bug: the terms were
written with a leading slash, which anchors them harder than intended.

| Probe | Why `#32` missed it |
|---|---|
| `/api/secrets`, `/api/credentials`, `/api/config` | `contains "/.env"` matches none of these |
| `/api/env` | no dot at all, so no `.env` term matches — **still uncovered**, see below |
| `/sendgrid.env`, `/prod.env`, `/aws.env`, `/config/db.env` | `contains "/.env"` requires the dot to follow a slash |
| `/xampp/php-cgi.exe?…` | `contains ".php"` does not match `php-cgi.exe` |
| `/%252F_ignition%252Fhealth-check` | one `url_decode` pass leaves `%2f_ignition%2f`, so `"/_ignition/"` misses |

**523 requests across 226 distinct paths** hit the `/api/…` config-discovery family over
the 31 days of retained logs. **Every one returned 404** — nothing is exposed. This is
hygiene, not an incident.

Confirmed before widening the expression:

- `/api/auth` **is** a real route prefix (`/api/auth/login`), so it stays out of the term
  list; `/api/v1/` and `/api/v2/` are not used by this app and are safe to block.
- The app's real routes are `/`, `/login`, `/worlds/<uuid>`, `/stories/<uuid>`,
  `/assets/*`, `/static/images/<uuid>.jpg`, and the `/api/{auth,translate,image-buckets,
  worlds,stories,items,entities}` blueprints. Generated images are named with UUIDs, not
  from prompts, so no user content ever appears in a path.

Replaying the widened expression over all 36,065 retained origin requests: **19,805 probes
blocked** (up from 12,310) and **zero real app requests blocked**. Reproduce with
`python3 scripts/verify_waf_expression.py --log <(docker logs marcusthelegend-nginx-1)`.

### The `/assets/` guard

Widening `.php` → `php` and adding `config` / `settings` makes the terms broad enough to
collide with the app's own JavaScript: Vite names output chunks after their source module,
so a future `frontend/src/config.js` ships as `/assets/config-<hash>.js`. Everything Vite
emits lives under `/assets/`, so the expression ends with
`and not … contains "/assets/"`. That costs ~8 blocked probes a month — nginx serves those
off disk regardless — and buys immunity from a class of outage that children on iPads
could not report.

## Post-deploy verification (2026-09-02)

The widened rule went live 2026-09-02. One rule in the phase, expression byte-identical
to `./scripts/cloudflare_waf_rule.sh --dry-run`; the #32 rule was replaced, not stacked
(the `LEGACY_DESCS` merge handled the rename).

Live checks through `https://marcusthelegend.com`:

| | result |
|---|---|
| Real routes (`/`, `/login`, `/worlds`, `/healthz`, `/assets/*`, `/api/worlds`) | 200 |
| POST-only routes (`/api/translate`, `/api/auth/login`) | 405 from Flask — reaching the origin, not edge-blocked |
| Probes (`/wp-login.php`, `/.env`, `/sendgrid.env`, `/api/secrets`, `/api/config`, `/.git/config`, `/actuator/env`, `/xampp/php-cgi.exe`, `/api/v1/users`, `/backup.sql`, `/id_rsa.pem`, `/docker-compose.yml`) | 403 at the edge |
| Controls (`/robots.txt`, `/sitemap.xml`) | 200 — correctly not blocked |

**One miss found in testing: `/api/env` returned 404, not 403.** The claim above that
`".env"` covers `/api/env` was wrong — `/api/env` has no dot, so no `.env` term can
match it. Closing it needs an anchored `"/api/env"` term or a bare `"env"`; `env` is a
risky substring to block unanchored (`/environment`, `/seven`, `/eleven`). Left open
deliberately — 13 requests in 31 days, all 404. Tracked in TASKS.md P14.

Replaying the deployed expression over the full retained log (40,302 requests, a week
more than the 36,065 above): **21,764 probes blocked, 0 real app requests blocked.**
10,897 non-app requests across 4,446 paths still reach the origin — 402 of them under
`/api/` (`/api/graphql` ×42, `/api/env` ×13, `/api/openapi.json` ×11, then a long tail).

Note `/api/health` (13 requests) is deliberately *not* blocked: **P3** will add it as a
real route, and `verify_waf_expression.py` guards it.

## The tailnet still bypasses all of this (TASKS.md P13)

`spark-b0aa.taileb1e78.ts.net` reaches nginx without passing through Cloudflare, so no WAF
rule covers it. Since the rule went live, **58 probe requests arrived that way** — including
`/.git/config` ×12, `/.env` ×8, `/wp-login.php` ×4, `/actuator/env` ×2.

Volume is trivial next to the 5,699 the edge will now absorb, and — importantly for P14 —
**none of the `/api/…` config-discovery probes came in over the tailnet.** They all arrived
via `marcusthelegend.com` and `www`, which is why extending the WAF rule is the right fix
here rather than an argument for retiring the tailnet. P13 still stands on its own merits;
this just is not the evidence for it.

## What the rule still will not catch

7,564 requests in the period matched no term at all, spread across **12,850 distinct
paths** — a long tail of one-off probes with no shared substring:

| path | requests |
|---|---:|
| `/robots.txt` | 509 |
| `/sitemap.xml` | 450 |
| `/graphql`, `/api/graphql`, `/v1/graphql` | 92 |
| `/.well-known/`, `/.well-known/jwks.json` | 47 |
| `/console`, `/admin`, `/dashboard`, `/manage`, `/signin`, `/profile` | ~110 |
| everything else | one or two requests each |

`robots.txt` and `sitemap.xml` are ordinary crawlers and should not be blocked. The rest
cannot be addressed with `contains` terms without risking the app — it needs rate limiting
by client, which is **P6**, and P6 in turn needs the `CF-Connecting-IP` trust boundary
fixed (**P12**) before the logged IPs can be trusted.

Scanners also probe the query string (`/?file=../../.env`, `/api/fetch?url=http://169.254.
169.254/latest/meta-data/`). The rule inspects `http.request.uri.path` only. Matching the
full URI would catch these but would make every term far more collision-prone, so it stays
out for now.
