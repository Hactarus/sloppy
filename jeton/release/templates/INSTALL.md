# Jeton server @VERSION@ - install

Self-contained: compiled server (`dist/`), production `node_modules`, SQL migrations (`db/`), the OpenAPI contract (`api/`)
and the web app (`public/`). One process serves the API (`/v1/...`), the PWA (`/`) and the guest page (`/t/<tagCode>`).
Needs: Node.js >= 22 (Linux x64 or arm64, glibc) and PostgreSQL 16.

## 1. Unpack

    sudo mkdir -p /opt/jeton && sudo tar -xzf jeton-server-@VERSION@.tar.gz --strip-components=1 -C /opt/jeton
    sudo useradd --system --home /opt/jeton --shell /usr/sbin/nologin jeton

## 2. Database (owner role = migrations/CLI only, runtime role is created by `migrate`)

    sudo -u postgres createuser --pwprompt jeton_owner
    sudo -u postgres createdb --owner jeton_owner jeton

## 3. Configure

    sudo install -d -m 750 -o root -g jeton /etc/jeton
    sudo cp /opt/jeton/.env.example /etc/jeton/jeton.env
    /opt/jeton/bin/jeton gen-secrets        # paste the output over the secrets in jeton.env
    sudo chmod 640 /etc/jeton/jeton.env; sudo chgrp jeton /etc/jeton/jeton.env

Set at least `NODE_ENV=production`, `DATABASE_URL_OWNER` (jeton_owner), `DATABASE_URL` (the runtime login `jeton_api`
and its password; `migrate` creates it from this URL), `PUBLIC_BASE_URL` (the https URL written on the tags) and `PRIVACY_URL`.
Behind a reverse proxy (recommended: TLS is required for NFC/PWA on phones) set `TRUST_PROXY=true`.
In production the server refuses to start with default secrets.

## 4. Migrate, first admin, run

    set -a; . /etc/jeton/jeton.env; set +a
    /opt/jeton/bin/jeton migrate
    /opt/jeton/bin/jeton create-admin --name "Admin" --pin 123456 --new-event "My event"   # prints a console enrolment code
    # optional demo data: /opt/jeton/bin/jeton seed-demo
    sudo cp /opt/jeton/jeton.service /etc/systemd/system/ && sudo systemctl daemon-reload
    sudo systemctl enable --now jeton
    curl http://127.0.0.1:3000/healthz

The unit runs `migrate` before every start (idempotent, checksummed). Check ledger integrity any time with
`/opt/jeton/bin/jeton verify-chain --event <uuid>`. Back up the database and the secrets file; the tag keys
(`TAG_MASTER_KEY`) cannot be recovered.

## Docker

The release also ships `jeton-server-@VERSION@.oci.tar` (linux/amd64): `docker load -i jeton-server-@VERSION@.oci.tar`,
then use `docker-compose.yml` from the repository (`docker compose up`).
