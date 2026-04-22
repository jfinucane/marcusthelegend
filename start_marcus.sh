#!/bin/bash

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
