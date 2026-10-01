#!/bin/bash
#
# DEPRECATED — renamed from start_marcus.sh on 2026-10-01. Do not run on this box
# while prod is live.
#
# This script is dev-only. It hardcodes `docker-compose.yml`, so it would
# `down --remove-orphans` — deleting the running nginx and cloudflared containers
# and taking the public site down — then `fuser -k` port 5000 out from under the
# prod backend, replacing gunicorn with the Flask dev server. The reboot-recovery
# path for prod is the restart policy, which handles it without help; if you ever
# do need to intervene, it's
# `docker compose -f docker-compose.prod.yml up --build -d`.
#
# The guard below refuses to run when the prod stack is detected.
#

# ── Fail-safe guard ──────────────────────────────────────────────────────────
# Returns 0 when the prod stack is live. Two signals, because either container
# set can be present without the other: the backend's compose label, and the
# existence of nginx/cloudflared at all (they belong only to prod).
prod_is_live() {
    local live_config
    live_config=$(docker inspect marcusthelegend-backend-1 \
        --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' \
        2>/dev/null || true)
    case "$live_config" in
        *docker-compose.prod.yml*) return 0 ;;
    esac
    if [ -n "$(docker ps -q \
        --filter name=marcusthelegend-nginx \
        --filter name=marcusthelegend-cloudflared 2>/dev/null)" ]; then
        return 0
    fi
    return 1
}

if prod_is_live && [ "${ALLOW_PROD_TEARDOWN:-}" != "1" ]; then
    cat >&2 <<'MSG'
REFUSING TO RUN: the production stack is live on this box.

This script drives the dev stack (docker-compose.yml). Running it now would:
  - delete the running nginx and cloudflared containers — the public site and
    the ts.net URL the kids have bookmarked both go down
  - kill whatever holds port 5000, i.e. the gunicorn prod backend
  - leave the Flask dev server serving live traffic in its place

Prod recovers from a reboot on its own (restart: unless-stopped), so this is
almost certainly not what you want. To rebuild prod deliberately:

  docker compose -f docker-compose.prod.yml up --build -d

If you really do mean to tear prod down and bring the dev stack up here:

  ALLOW_PROD_TEARDOWN=1 ./start_marcus_deprecated.sh
MSG
    exit 1
fi

PROJECT_DIR="$HOME/projects/marcusthelegend"
TIMEOUT=30

echo "Stopping existing services..."
fuser -k 5000/tcp 5173/tcp 2>/dev/null || true
docker compose -f "$PROJECT_DIR/docker-compose.yml" down --remove-orphans 2>/dev/null || true

echo "Starting services..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" up --build -d
if [ $? -ne 0 ]; then
    echo "ERROR: docker compose failed to start."
    exit 1
fi

echo "Waiting for services to be ready..."
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    STATUS=$(docker compose -f "$PROJECT_DIR/docker-compose.yml" ps --format json 2>/dev/null \
        | grep -c '"running"' || true)
    if [ "$STATUS" -ge 2 ]; then
        break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "ERROR: Services did not start within ${TIMEOUT}s."
    docker compose -f "$PROJECT_DIR/docker-compose.yml" logs --tail=20
    exit 1
fi

echo "Checking backend health..."
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    if curl -sf http://localhost:5000/api/worlds > /dev/null 2>&1; then
        break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "ERROR: Backend did not respond within ${TIMEOUT}s."
    docker compose -f "$PROJECT_DIR/docker-compose.yml" logs backend --tail=20
    exit 1
fi

echo ""
echo "Services running:"
docker compose -f "$PROJECT_DIR/docker-compose.yml" ps
echo ""
echo "  App:     http://localhost:5173"
echo "  App:     https://spark-b0aa.taileb1e78.ts.net"
echo "  API:     http://localhost:5000"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Docker cheat sheet"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Logs (all):      docker compose logs -f"
echo "  Logs (backend):  docker compose logs -f backend"
echo "  Status:          docker compose ps"
echo "  Stop:            docker compose down"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
