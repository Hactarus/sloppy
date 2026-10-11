import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeWorld, type World } from './helpers.js';
import { uuidv7 } from '../src/util/ids.js';
import { signJwt } from '../src/auth/jwt.js';
import { loadContract } from '../src/contract.js';

let w: World;
beforeAll(async () => { w = await makeWorld(); });
afterAll(async () => { await w.close(); });

describe('auth', () => {
  it('device enrolment code -> device token -> staff list -> PIN login -> session', async () => {
    const code = await w.as('admin').post(`/events/${w.eventId}/enrollment-codes`, { kind: 'terminal', stand_id: w.stands.bar });
    expect(code.status).toBe(201);
    expect(code.body.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    const enr = await w.api('').post('/auth/devices/enroll', { enrollment_code: code.body.code, device_name: 'Tab', platform: 'android', app_version: '1.0' });
    expect(enr.status).toBe(201);
    expect(enr.body.device_token).toMatch(/^dvc_/);
    expect(enr.body.stand_id).toBe(w.stands.bar);
    const again = await w.api('').post('/auth/devices/enroll', { enrollment_code: code.body.code, device_name: 'Tab', platform: 'android' });
    expect(again.status).toBe(410);
    expect(again.body.code).toBe('ENROLLMENT_CODE_INVALID');
    const dev = enr.body.device_token;
    const staff = await w.api(dev).get('/auth/staff');
    expect(staff.body.items.map((s: any) => s.role).sort()).toEqual(['admin', 'auditor', 'cashier', 'vendor']);
    const bad = await w.api(dev).post('/auth/login', { staff_id: w.staff.vendor, pin: '9999' });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('INVALID_CREDENTIALS');
    const ok = await w.api(dev).post('/auth/login', { staff_id: w.staff.vendor, pin: '1234' });
    expect(ok.status).toBe(200);
    expect(ok.body.session).toMatchObject({ role: 'vendor', stand_id: w.stands.bar, training: false });
    const me = await w.api(ok.body.access_token).get('/auth/me');
    expect(me.body.staff.id).toBe(w.staff.vendor);
    // the JWT is not accepted where only a device token is allowed, and vice versa
    expect((await w.api(ok.body.access_token).get('/auth/staff')).status).toBe(401);
    expect((await w.api(dev).get('/auth/me')).status).toBe(401);
  });

  it('5 wrong PINs lock the staff member for 15 minutes (PIN_LOCKED, 429, locked_until)', async () => {
    const lw = await makeWorld();
    try {
      const dev = lw.devices.bar.token;
      for (let i = 0; i < 4; i++) expect((await lw.api(dev).post('/auth/login', { staff_id: lw.staff.cashier, pin: '0000' })).body.code).toBe('INVALID_CREDENTIALS');
      const fifth = await lw.api(dev).post('/auth/login', { staff_id: lw.staff.cashier, pin: '0000' });
      expect(fifth.status).toBe(429);
      expect(fifth.body.code).toBe('PIN_LOCKED');
      expect(fifth.body.details.locked_until).toBeTruthy();
      expect(Number(fifth.headers['retry-after'])).toBeGreaterThan(0);
      const right = await lw.api(dev).post('/auth/login', { staff_id: lw.staff.cashier, pin: '1234' });
      expect(right.status).toBe(429);
    } finally { await lw.close(); }
  });

  it('role guard follows x-roles of the contract; unauthenticated, expired and revoked are distinct', async () => {
    const { ops } = loadContract(w.cfg.OPENAPI_PATH);
    expect(ops.length).toBeGreaterThanOrEqual(65);
    expect((await w.as('vendor').post('/topups', { client_tx_id: uuidv7() })).status).toBe(403);
    expect((await w.as('cashier').post('/orders', { client_tx_id: uuidv7() })).status).toBe(403);
    expect((await w.as('auditor').post('/topups', { client_tx_id: uuidv7() })).status).toBe(403);
    expect((await w.as('vendor').get(`/events/${w.eventId}/ledger/verify`)).body.code).toBe('FORBIDDEN');
    expect((await w.api('').get('/auth/me')).body.code).toBe('UNAUTHENTICATED');
    const res = await w.built.app.inject({ method: 'GET', url: '/v1/auth/me' });
    expect(res.statusCode).toBe(401);
    const expired = (await signJwt(w.cfg.JWT_SECRET, { sub: w.staff.admin, did: w.devices.console.id, eid: w.eventId, sid: null, role: 'admin', trn: false }, -10)).token;
    const e = await w.api(expired).get('/auth/me');
    expect(e.status).toBe(401);
    expect(e.body.code).toBe('TOKEN_EXPIRED');
    // revoke the bar device: both its device token and JWTs of that device stop working at once
    const rev = await w.as('admin').post(`/devices/${w.devices.food.id}/revoke`, { reason: 'stolen' });
    expect(rev.body.revoked_at).toBeTruthy();
    const vend = await w.api((await signJwt(w.cfg.JWT_SECRET, { sub: w.staff.vendor, did: w.devices.food.id, eid: w.eventId, sid: w.stands.food, role: 'vendor', trn: false }, 60)).token).get('/auth/me');
    expect(vend.body.code).toBe('DEVICE_REVOKED');
    expect((await w.api(w.devices.food.token).get('/auth/staff')).body.code).toBe('DEVICE_REVOKED');
  });

  it('vendors are bound to their stand; error bodies follow the contract', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 5);
    const r = await w.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.food, tag, lines: [{ item_id: w.items.frites, qty: 1 }] });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: 'STAND_MISMATCH', retryable: false });
    expect(r.body.request_id).toMatch(/^req_/);
    const v = await w.as('vendor').post('/orders', { client_tx_id: 'nope', lines: [] });
    expect(v.status).toBe(400);
    expect(v.body.code).toBe('VALIDATION_ERROR');
    expect(v.body.details.fields.length).toBeGreaterThan(0);
    expect((await w.as('vendor').get('/nope')).body.code).toBe('NOT_FOUND');
  });
});
