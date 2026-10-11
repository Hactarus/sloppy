import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeWorld, type World } from './helpers.js';

let w: World;
beforeAll(async () => { w = await makeWorld(); });
afterAll(async () => { await w.close(); });

describe('smoke', () => {
  it('health, session, topup', async () => {
    const h = await w.api('x').get('/health');
    expect(h.status).toBe(200);
    expect((await w.as('cashier').get('/auth/me')).body.role).toBe('cashier');
    const tag = await w.newTag();
    const r = await w.topup(tag, 10);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.balance_tokens).toBe(10);
  });
});
