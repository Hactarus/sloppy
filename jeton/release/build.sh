#!/usr/bin/env bash
# Reproduce the Jeton server release artifacts (no Docker daemon needed).
#   release/build.sh                 -> release/out/jeton-server-$VERSION.tar.gz, .oci.tar, SHA256SUMS
# Env: VERSION (default 0.1.0), SKIP_APP=1 (reuse app/dist), SKIP_OCI=1, CRANE=/path/to/crane,
#      BASE_IMAGE (default node:22-bookworm-slim), OCI_PLATFORM (default linux/amd64)
set -euo pipefail

VERSION=${VERSION:-0.1.0}
BASE_IMAGE=${BASE_IMAGE:-node:22-bookworm-slim}
OCI_PLATFORM=${OCI_PLATFORM:-linux/amd64}
CRANE_VERSION=${CRANE_VERSION:-v0.22.1}
HERE=$(cd "$(dirname "$0")" && pwd)
JETON=$(dirname "$HERE")
OUT=$HERE/out
NAME=jeton-server-$VERSION
mkdir -p "$OUT"
WORK=$(mktemp -d)
REG_PID=
cleanup() { [ -n "$REG_PID" ] && kill "$REG_PID" 2>/dev/null || true; rm -rf "$WORK"; }
trap cleanup EXIT

# --- 1. web app --------------------------------------------------------------------------------------------
if [ -z "${SKIP_APP:-}" ]; then
  echo "==> building web app"
  cd "$JETON/app"
  [ -d node_modules ] || pnpm install --frozen-lockfile
  pnpm build
fi
[ -f "$JETON/app/dist/index.html" ] || { echo "app/dist missing" >&2; exit 1; }

# --- 2. server build ---------------------------------------------------------------------------------------
echo "==> building server"
cd "$JETON/server"
[ -d node_modules ] || pnpm install --frozen-lockfile
pnpm typecheck
rm -rf dist && pnpm build

# --- 3. production node_modules (flat, linux x64+arm64 glibc native bindings) -------------------------------
echo "==> installing production dependencies"
DEPS=$WORK/deps
mkdir -p "$DEPS"
cp package.json pnpm-lock.yaml "$DEPS/"
cat > "$DEPS/pnpm-workspace.yaml" <<'YAML'
nodeLinker: hoisted
supportedArchitectures:
  os: [linux]
  cpu: [x64, arm64]
  libc: [glibc]
YAML
(cd "$DEPS" && pnpm install --prod --frozen-lockfile --ignore-scripts >/dev/null)

# --- 4. assemble the tree -----------------------------------------------------------------------------------
echo "==> assembling $NAME"
ST=$WORK/stage/$NAME
mkdir -p "$ST/bin" "$ST/db"
cp -r "$JETON/server/dist" "$ST/dist"
cp -r "$DEPS/node_modules" "$ST/node_modules"
cp "$JETON/server/package.json" "$ST/package.json"
cp -r "$JETON/db/migrations" "$ST/db/migrations"
mkdir -p "$ST/api" && cp "$JETON/api/openapi.yaml" "$ST/api/openapi.yaml"
cp -r "$JETON/app/dist" "$ST/public"
cp "$HERE/bin/jeton" "$ST/bin/jeton" && chmod 755 "$ST/bin/jeton"
cp "$HERE/templates/jeton.service" "$ST/jeton.service"
sed "s/@VERSION@/$VERSION/g" "$HERE/templates/INSTALL.md" > "$ST/INSTALL.md"
sed -e 's/^NODE_ENV=.*/NODE_ENV=production/' -e 's/^CORS_ORIGINS=.*/CORS_ORIGINS=/' "$JETON/server/.env.example" > "$ST/.env.example"
echo "$VERSION" > "$ST/VERSION"

tar_det() { # deterministic tar: tar_det <outfile> <dir> <member>
  tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --format=gnu -cf "$1" -C "$2" "$3"
}

# --- 5. release tarball -------------------------------------------------------------------------------------
tar_det "$WORK/$NAME.tar" "$WORK/stage" "$NAME"
gzip -n -9 -c "$WORK/$NAME.tar" > "$OUT/$NAME.tar.gz"
echo "    $OUT/$NAME.tar.gz"

# --- 6. OCI image via crane ---------------------------------------------------------------------------------
if [ -z "${SKIP_OCI:-}" ]; then
  echo "==> building OCI image on $BASE_IMAGE (crane)"
  CRANE=${CRANE:-$(command -v crane || true)}
  if [ -z "$CRANE" ]; then
    CRANE=$HERE/.cache/crane
    if [ ! -x "$CRANE" ]; then
      mkdir -p "$HERE/.cache"
      curl -fsSL "https://github.com/google/go-containerregistry/releases/download/$CRANE_VERSION/go-containerregistry_Linux_x86_64.tar.gz" | tar -xz -C "$HERE/.cache" crane
    fi
  fi
  # layer rooted at /app (same layout as server/Dockerfile)
  mkdir -p "$WORK/layer"
  cp -a "$WORK/stage/$NAME" "$WORK/layer/app"
  tar_det "$WORK/layer.tar" "$WORK/layer" app
  gzip -n -9 -c "$WORK/layer.tar" > "$WORK/layer.tar.gz"

  # `crane append` pushes; use crane's in-memory registry on localhost as a scratch space.
  PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')
  "$CRANE" registry serve --address "127.0.0.1:$PORT" >"$WORK/registry.log" 2>&1 & REG_PID=$!
  for _ in $(seq 50); do curl -fs "http://127.0.0.1:$PORT/v2/" >/dev/null 2>&1 && break; sleep 0.2; done
  REF=127.0.0.1:$PORT/jeton-server:$VERSION
  "$CRANE" append --platform "$OCI_PLATFORM" -b "$BASE_IMAGE" -f "$WORK/layer.tar.gz" -t "$REF"
  "$CRANE" mutate "$REF" --platform "$OCI_PLATFORM" \
    --entrypoint /app/bin/jeton --cmd serve --workdir /app --user node --exposed-ports 3000/tcp \
    --env NODE_ENV=production --env PORT=3000 --env HOST=0.0.0.0 --env STATIC_DIR=/app/public \
    --env MIGRATIONS_DIR=/app/db/migrations --env OPENAPI_PATH=/app/api/openapi.yaml --env APP_VERSION="$VERSION" \
    --label org.opencontainers.image.title=jeton-server --label org.opencontainers.image.version="$VERSION" \
    -t "$REF"
  "$CRANE" pull --platform "$OCI_PLATFORM" --format tarball "$REF" "$WORK/image.tar"
  # give it a stable docker tag (jeton-server:VERSION and :latest) instead of the scratch registry name
  python3 "$HERE/retag.py" "$WORK/image.tar" "$OUT/$NAME.oci.tar" "jeton-server:$VERSION" "jeton-server:latest"
  echo "    $OUT/$NAME.oci.tar"
fi

# --- 7. checksums -------------------------------------------------------------------------------------------
echo "==> SHA256SUMS"
(cd "$OUT" && rm -f SHA256SUMS && sha256sum -- $(ls -1 | grep -v '^SHA256SUMS$' | sort) > SHA256SUMS && cat SHA256SUMS)
