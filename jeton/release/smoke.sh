#!/usr/bin/env bash
# End-to-end smoke test of a running server seeded with `jeton seed-demo`.
#   release/smoke.sh http://127.0.0.1:3000 <cashdesk-enrolment-code> <bar-enrolment-code> <tag-code> <tag-uid>
# Checks: /healthz, PWA index, /t/<tag>, public balance, then one top-up (cash desk + cashier) and one order (bar + vendor).
set -euo pipefail
B=$1 CASH_CODE=$2 BAR_CODE=$3 TAG=$4 UID_=$5
J='content-type: application/json'
ok() { echo "PASS $*"; }
uuid7() { node -e 'const b=require("crypto").randomBytes(16);const t=BigInt(Date.now());for(let i=0;i<6;i++)b[i]=Number((t>>BigInt(8*(5-i)))&0xffn);b[6]=(b[6]&0x0f)|0x70;b[8]=(b[8]&0x3f)|0x80;const h=b.toString("hex");console.log(`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`)'; }

[ "$(curl -fs "$B/healthz")" = '{"ok":true}' ] && ok "GET /healthz"
curl -fs "$B/" | grep -qi '<div id="root"\|<!doctype html' && ok "GET / (PWA index.html)"
curl -fs "$B/t/$TAG" | grep -q 'guest\|<main id="a"' && ok "GET /t/<tag> (t.html)"
bal0=$(curl -fs "$B/v1/public/tags/$TAG" | jq .balance_tokens); ok "public balance before = $bal0"

enroll() { curl -fs -X POST "$B/v1/auth/devices/enroll" -H "$J" -d "{\"enrollment_code\":\"$1\",\"device_name\":\"smoke\",\"platform\":\"web\",\"app_version\":\"0.1.0\"}"; }
login() { # login <device_token> <role> <pin>
  local sid; sid=$(curl -fs "$B/v1/auth/staff" -H "authorization: Bearer $1" | jq -r --arg r "$2" '.items[]|select(.role==$r)|.id' | head -1)
  curl -fs -X POST "$B/v1/auth/login" -H "authorization: Bearer $1" -H "$J" -d "{\"staff_id\":\"$sid\",\"pin\":\"$3\"}" | jq -r .access_token
}
D=$(enroll "$CASH_CODE"); DT=$(jq -r .device_token <<<"$D"); CASHIER=$(login "$DT" cashier 2222); ok "cash desk device enrolled, cashier logged in"
V=$(enroll "$BAR_CODE"); VT=$(jq -r .device_token <<<"$V"); STAND=$(jq -r .stand_id <<<"$V"); VENDOR=$(login "$VT" vendor 3333); ok "bar device enrolled, vendor logged in"

TX=$(uuid7)
top=$(curl -fs -X POST "$B/v1/topups" -H "authorization: Bearer $CASHIER" -H "$J" -d "{\"client_tx_id\":\"$TX\",\"tag\":{\"tag_code\":\"$TAG\",\"uid\":\"$UID_\"},\"payment_method\":\"cash\",\"amount_cents\":2000,\"terms_version\":\"tos-2026-07\"}")
ok "top-up 2000 cents -> $(jq -c '{tokens,balance_tokens}' <<<"$top")"
replay=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/v1/topups" -H "authorization: Bearer $CASHIER" -H "$J" -d "{\"client_tx_id\":\"$TX\",\"tag\":{\"tag_code\":\"$TAG\",\"uid\":\"$UID_\"},\"payment_method\":\"cash\",\"amount_cents\":2000,\"terms_version\":\"tos-2026-07\"}")
[ "$replay" = 200 ] && ok "idempotent replay of the top-up -> 200"

ITEM=$(curl -sS --fail-with-body "$B/v1/events/$(jq -r .event_id <<<"$V")/catalog" -H "authorization: Bearer $VENDOR" | jq -r --arg s "$STAND" '[.items[]|select(.stand_id==$s and (.min_age==null))][0].id')
ord=$(curl -sS --fail-with-body -X POST "$B/v1/orders" -H "authorization: Bearer $VENDOR" -H "$J" -d "{\"client_tx_id\":\"$(uuid7)\",\"stand_id\":\"$STAND\",\"tag\":{\"tag_code\":\"$TAG\",\"uid\":\"$UID_\"},\"lines\":[{\"item_id\":\"$ITEM\",\"qty\":2}]}")
ok "order -> $(jq -c '{total_tokens,balance_tokens}' <<<"$ord")"
bal1=$(curl -fs "$B/v1/public/tags/$TAG" | jq .balance_tokens); ok "public balance after = $bal1"
echo "SMOKE OK"
