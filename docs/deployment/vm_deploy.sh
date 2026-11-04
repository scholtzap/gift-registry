#!/usr/bin/env bash
set -euo pipefail
BASE=$HOME/pinata
PRIV=$HOME/pinata-private
mkdir -p "$BASE" "$PRIV"
chmod 700 "$PRIV"
cd "$BASE"
if [ ! -d checkout/.git ]; then
  git clone pinata.bundle checkout
fi
cd checkout
git fetch origin main
git checkout main
# A fetch alone leaves the old checkout in place, so the image tag stays on the
# previous SHA and compose does not recreate the app. The bundle is the source.
git reset --hard origin/main
git log --oneline -1
SHA=$(git rev-parse --short HEAD)
echo "deploying $SHA"

# Secrets generated on the VM, never printed.
if [ ! -f "$PRIV/postgres_password" ]; then openssl rand -hex 24 > "$PRIV/postgres_password"; fi
if [ ! -f "$PRIV/build_env" ]; then
  cat > "$PRIV/build_env" <<EOF
DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
SESSION_SECRET=$(openssl rand -hex 32)
PHONE_HASH_PEPPER=$(openssl rand -hex 32)
CIRCLE_BASE_URL=https://pinata.scholtz.work/app
EOF
fi
PGPASS=$(cat "$PRIV/postgres_password")
if [ ! -f "$PRIV/app.env" ]; then
  cat > "$PRIV/app.env" <<EOF
DATABASE_URL=postgresql://gifts:${PGPASS}@postgres:5432/gifts
SESSION_SECRET=$(openssl rand -hex 32)
PHONE_HASH_PEPPER=$(openssl rand -hex 32)
CIRCLE_BASE_URL=https://pinata.scholtz.work/app
DEMO_MODE=on
WHATSAPP_VERIFY_TOKEN=$(openssl rand -hex 16)
MEDIA_DIR=/data/media
EOF
fi
if [ ! -f "$PRIV/caddy.env" ]; then
  printf 'CIRCLE_HOST=pinata.scholtz.work\n' > "$PRIV/caddy.env"
fi
chmod 600 "$PRIV"/*
cat > "$PRIV/compose.env" <<EOF
APP_IMAGE=pinata-app:1.0.0-${SHA}
CADDY_IMAGE=pinata-caddy:1.0.0
APP_RUNTIME_ENV_FILE=$PRIV/app.env
CADDY_RUNTIME_ENV_FILE=$PRIV/caddy.env
POSTGRES_PASSWORD_FILE=$PRIV/postgres_password
POSTGRES_IMAGE=postgres:16-alpine
HTTPS_BIND_IP=0.0.0.0
HTTPS_PORT=443
PINATA_BASE_PATH=
CADDYFILE_PATH=./docs/deployment/Caddyfile.pinata
SITE_DIR=$BASE/checkout/site/public
EOF

echo "=== building app image (native arm64) ==="
DOCKER_BUILDKIT=1 docker build -f docs/deployment/Dockerfile.oracle --build-arg PINATA_BASE_PATH= --secret id=build_env,src="$PRIV/build_env" -t "pinata-app:1.0.0-${SHA}" .
docker build -f docs/deployment/Dockerfile.caddy-public -t pinata-caddy:1.0.0 docs/deployment
echo "=== compose config ==="
docker compose --project-directory . --env-file "$PRIV/compose.env" -f docs/deployment/docker-compose.oracle.yml config --quiet
echo "=== starting postgres, migrating ==="
docker compose --project-directory . --env-file "$PRIV/compose.env" -f docs/deployment/docker-compose.oracle.yml up -d postgres
docker compose --project-directory . --env-file "$PRIV/compose.env" -f docs/deployment/docker-compose.oracle.yml --profile ops run --rm migrate
echo "=== seeding demo cast ==="
docker compose --project-directory . --env-file "$PRIV/compose.env" -f docs/deployment/docker-compose.oracle.yml run --rm --no-deps app node --import tsx scripts/seed.ts || echo "seed step reported an issue - check log above"
echo "=== starting app + worker ==="
docker compose --project-directory . --env-file "$PRIV/compose.env" -f docs/deployment/docker-compose.oracle.yml up -d app worker
sleep 10
docker compose --project-directory . --env-file "$PRIV/compose.env" -f docs/deployment/docker-compose.oracle.yml ps
echo "=== app local health ==="
docker exec $(docker compose --project-directory . --env-file "$PRIV/compose.env" -f docs/deployment/docker-compose.oracle.yml ps -q app) node -e "fetch('http://127.0.0.1:3000/health').then(async r=>{console.log(r.status); if(!r.ok) process.exit(1)}).catch(()=>{console.error('health failed'); process.exit(1)})"
echo "STAGE1_DONE $SHA"
