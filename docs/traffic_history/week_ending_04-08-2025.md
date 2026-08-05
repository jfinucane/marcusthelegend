# Traffic review — week ending 2026-08-04

**Period:** Wed 2026-07-29 00:00 UTC → Tue 2026-08-04 23:59 UTC (7 days)
**Source:** `docker logs marcusthelegend-nginx-1` (nginx sits behind the Cloudflare Tunnel
and in front of gunicorn/Flask, so it sees every request that reaches the origin).
**Zone:** `marcusthelegend.com` — Cloudflare **Free** plan.

> Filename note: this file is named `week_ending_04-08-2025.md` as requested. The data is
> from **2026**; the `2025` in the name looks like a typo. Rename when convenient — later
> weeks should follow whichever convention we settle on.

---

## Total requests

### Cloudflare analytics — total requests

Source: GraphQL `httpRequests1dGroups` on zone `marcusthelegend.com`.

```
                                                       requests
2026-07-29  ███████████████░░░░░                          3,162
2026-07-30  ███████████████░░░░░░░░░░░                    4,080
2026-07-31  █████████████████████████████████████████░░░  6,843
2026-08-01  ██████░░                                      1,238
2026-08-02  ██████░░░                                     1,347
2026-08-03  ███████░░░                                    1,630
2026-08-04  ████░░                                          912

            █ reached origin (nginx)   ░ absorbed at the Cloudflare edge
```

| Date | Requests | Unique visitors | Threats |
|---|---:|---:|---:|
| 2026-07-29 | 3,162 | 143 | 51 |
| 2026-07-30 | 4,080 | 80 | 5 |
| 2026-07-31 | 6,843 | 75 | 51 |
| 2026-08-01 | 1,238 | 72 | 1 |
| 2026-08-02 | 1,347 | 79 | 178 |
| 2026-08-03 | 1,630 | 66 | 4 |
| 2026-08-04 | 912 | 58 | 2 |
| **Week** | **19,212** | **573** | **292** |

**19,212 requests at the edge vs 14,617 at the origin** — Cloudflare absorbed 4,595 (24%)
before the tunnel, and passed the other 76% straight through. Caching is effectively nil
(14 cached requests all week), which is expected for a hash-named-asset SPA with a
no-store JSON API. The "573 unique visitors" figure is scanner-inflated and should not be
read as 573 people.

### Origin requests (nginx)

```
                                                       total
2026-07-29  ████████████████░░               2,400
2026-07-30  ███████████████░                 2,272
2026-07-31  ███████████████████████████████  6,453   <- scanner burst
2026-08-01  ██████░                            876
2026-08-02  ██████░                            928
2026-08-03  ███████                          1,034
2026-08-04  ████░                              654

            █ probe traffic   ░ everything else
```

| Date | Total | App | Crawler | Probe | Probe % |
|---|---:|---:|---:|---:|---:|
| 2026-07-29 | 2,400 | 133 | 54 | 2,213 | 92% |
| 2026-07-30 | 2,272 | 75 | 44 | 2,153 | 94% |
| 2026-07-31 | 6,453 | 217 | 37 | 6,199 | 96% |
| 2026-08-01 | 876 | 112 | 36 | 728 | 83% |
| 2026-08-02 | 928 | 47 | 60 | 821 | 88% |
| 2026-08-03 | 1,034 | 48 | 28 | 958 | 92% |
| 2026-08-04 | 654 | 37 | 52 | 565 | 86% |
| **Week** | **14,617** | **669** | **311** | **13,637** | **93%** |

*App* = requests matching a real route (`/`, `/login`, `/worlds/{uuid}`,
`/stories/{uuid}`, `/assets/*`, `/static/*`, `/api/*`). *Crawler* = `robots.txt`,
`sitemap.xml`, favicons. *Probe* = everything else.

**93% of origin traffic this week was hostile scanning.** Genuine app usage was 669
requests across seven days.

---

## Things worth flagging

### 1. `/api/translate` is completely broken — 9 of 9 calls returned 502

Every call to `/api/translate` this week failed. The route
(`backend/app/routes/tts.py:89`) proxies to the text-normalization LLM at
`http://localhost:8000`, and that service is down:

```
llm     localhost:8000   connection failed
magpie  localhost:8001   connection failed
kokoro  spark-b0aa:8880  200 OK
```

This is the step that turns "1995" into "nineteen ninety-five" before narration, so
**numbers in stories are being read out wrong or not at all**. Kokoro itself is healthy,
which is why narration still mostly works and nobody reported it — exactly the
silent-degradation pattern that our 10–12 year old users cannot diagnose or report.

**Action:** bring `localhost:8000` back up, and give `/api/translate` a graceful
fallback so a dead normalizer returns the original text instead of a 502.

### 2. The origin answers HTTP 200 to every bogus path

14,132 of 14,675 responses were `200`. nginx serves the SPA `index.html` (585 bytes) as a
catch-all, so `/.git/config`, `/wp-login.php` and `/.env` all return **200 OK** with an
HTML body. Nothing leaks — it is just `index.html` — but to a scanner the site looks like
every path exists, which is very likely why the probing is sustained rather than a
one-off sweep. Returning a real 404 for non-app paths would make this host far less
interesting to the scanners feeding it.

### 3. Scanners are URL-encoding to evade path filters

**2,363 requests** used `%2e` in place of `.` — `/%2eenv`, `/index%2ephp`,
`/%2egit/config`. Any blocklist that matches on the raw path misses all of them. This is
why the WAF rule below wraps the path in `url_decode()`, and it should be treated as a
standing requirement for any future path-matching rule.

### 4. Two hosts produced 36% of the week's traffic

| Requests | Source | Notes |
|---:|---|---|
| 2,833 | `185.177.72.29` | `curl/8.7.1`, `.env`/`.git` dictionary sweep |
| 2,486 | `185.177.72.67` | same operator, same `/24` |
| 1,537 | `20.251.58.190` | Azure |
| 1,161 | `20.63.98.115` | Azure |
| 1,013 | `172.202.44.182` | Azure |

The `185.177.72.0/24` pair drove the 2026-07-31 spike in two bursts (06:00 UTC and 23:00
UTC). Most of the rest originates from Azure ranges. Also present: `l9scan/2.0`,
`crusader-worker/1.0`, and a large `Mozilla/5.0 (Windows NT 10.0…)`-spoofing set.

### 5. Real usage is low and worth watching

669 app requests, and only ~35 loads of the JS bundle across the whole week — roughly
1–10 browser sessions a day, trending down (8 sessions Mon → 1 Tue). Active days show a
genuine session shape: `generate-image`, `kokoro-tts`, `edit-image`, `reset-chat`. Worth
tracking week over week now that we have a baseline.

---

## Change log — Cloudflare WAF

### 2026-08-05 · Custom rule: "Block scanner probe paths (PHP/WordPress/.env/.git)"

**Status:** ✅ **Live** — applied 2026-08-05 ~16:45 UTC.

| | |
|---|---|
| Zone | `marcusthelegend.com` (`bc7ada28985c60498a3b9f0e0158e519`) |
| Phase | `http_request_firewall_custom` |
| Rule ID | `1e7f22c47acb42f8be4e5855214af50a` |
| Action | `block` |
| Deploy | `scripts/cloudflare_waf_rule.sh` (idempotent — re-run to update) |

This is the **first** custom rule on the zone; the `http_request_firewall_custom`
entrypoint ruleset did not exist before and was created by this change. Nothing was
overwritten.

**The expression lives in `scripts/cloudflare_waf_rule.sh` and that script is the source
of truth.** It is not reproduced here — a copy in prose goes stale the first time the rule
changes. In short, it matches `url_decode()`d, lowercased request paths against 13
substrings covering PHP, WordPress, `.env`, `.git`, phpunit, `cgi-bin`, Spring `actuator`,
and Laravel `_ignition`.

If you change the rule in the Cloudflare dashboard, mirror it back into that script in the
same session, or the next `bash scripts/cloudflare_waf_rule.sh` will silently revert your
edit.

**Design notes:**

- **`url_decode()` is load-bearing** — without it the rule misses the 2,363 `%2e`-encoded
  probes described in flag 3 above.
- **No regex.** The `matches` operator is Business+ only and this zone is on Free, so the
  rule uses `contains` throughout. `contains ".php"` is actually broader than a regex
  anchored on the extension: it also catches the `.php7` / `.php1` / `.php.orig` variants
  scanners use.
- **Free plan allows 5 custom rules.** This is the first, so there are 4 slots left.

**Safety verification** (against this week's logs and the app's real route table):

- Tested against **all 48 real routes** — 33 Flask routes from `flask routes` plus the
  frontend router paths and static assets. **Zero matches.** The app serves no PHP, no
  WordPress, and no dotfiles, so none of these patterns can collide with real traffic.
- Would have blocked **10,751 of 14,617** requests (73%) with **no legitimate request
  affected**. The gap between 73% and the 93% probe figure is dictionary paths like
  `/wordpress`, `/test`, `/blog`, `/server-status` — deliberately left alone to keep the
  rule narrow and obviously safe.
- **`block` rather than a managed challenge** was chosen on purpose: our users are
  children on iPads who cannot solve or report a challenge. A blocked path is one no real
  user can reach anyway, so this fails safe (see `CLAUDE.md`, "Who uses this").
- **The `…ts.net` entry point is unaffected.** This rule lives in the Cloudflare zone;
  Tailscale Funnel traffic never traverses Cloudflare. See
  `docs/networking.md`.

**Post-deploy verification** (2026-08-05, live against `https://marcusthelegend.com`):

| Checked | Result |
|---|---|
| 12 probe paths — `/wp-login.php`, `/.env`, `/%2eenv`, `/index%2ephp`, `/.git/config`, `/xmlrpc.php`, `/cgi-bin/test`, `/actuator/env`, `/wp-content/uploads/x.php`, `/vendor/phpunit/…/eval-stdin.php`, `/_ignition/health-check`, `/x.php7` | **all 403** |
| 14 real paths — `/`, `/login`, `/register`, `/robots.txt`, `/sitemap.xml`, both favicons, `/apple-touch-icon.png`, all three `/assets/*`, `/api/worlds`, a real world URL, a real story URL | **all 200** |
| `https://spark-b0aa.taileb1e78.ts.net/` and `/login` | **200** — unaffected, as expected |

Both `%2e`-encoded probes returned 403, confirming `url_decode()` does its job.

> **Gotcha for next time:** rule propagation is not instant. Immediately after the PUT,
> some probe paths still returned 200 while others already returned 403 — from the *same*
> edge PoP, so it is rollout lag, not a rule defect. Give it ~60 seconds before concluding
> an expression is wrong.

**Rollback:** re-run `scripts/cloudflare_waf_rule.sh` with the rule removed, or disable it
in the dashboard under Security → WAF → Custom rules. The script only touches rules whose
description matches, so unrelated rules are preserved.

### 2026-08-05 · API token scope widened

To fetch analytics and deploy the rule, `CLOUDFLARE_API_TOKEN` (token `odd-dream-aff3`,
id `db2d8b2c179d580e6328b2c9a86bf19f`) gained two permissions on this zone:

- `Zone · Analytics · Read` — for the total-requests graph above
- `Zone · WAF · Edit` — for the rulesets API

Previous scope (`Zone · DNS · Write`, `Zone · Zone Settings · Write`, `Zone · Zone · Read`)
was retained. Editing a token's permissions does **not** roll its secret, so `backend/.env`
was untouched.

---

## Follow-ups

1. **Next week:** compare the Cloudflare total-requests graph against origin volume.
   Expect origin traffic to fall to roughly 1,000–4,000/week and the edge/origin gap to
   widen sharply as the rule absorbs probes.
2. **Fix `/api/translate`** (flag 1) — restart the normalizer on `localhost:8000` and add
   a fallback so a dead service degrades to un-normalized text instead of a 502.
3. **Consider a real 404** for non-app paths (flag 2) instead of the blanket SPA 200.
4. **Watch the remaining 20%** of probe traffic — dictionary paths (`/wordpress`, `/test`,
   `/blog`, `/server-status`) that the rule deliberately does not cover. If they persist
   at volume, a second custom rule is cheap (4 of 5 Free-plan slots remain).
