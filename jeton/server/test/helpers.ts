import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { buildApp, type Built } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { createSql, type Q } from '../src/db.js';
import { signJwt } from '../src/auth/jwt.js';
import { hashPin } from '../src/auth/pin.js';
import { sha256 } from '../src/util/crypto.js';
import { newTagCode, uuidv7 } from '../src/util/ids.js';
import { FakePaymentProvider } from '../src/payments/fake.js';

export type Role = 'admin' | 'cashier' | 'vendor' | 'auditor';

export interface Res {
  status: number;
  body: any;
  headers: Record<string, any>;
  text: string;
}

export interface World {
  built: Built;
  cfg: Config;
  owner: Q;
  fake: FakePaymentProvider;
  eventId: string;
  organizerId: string;
  stands: { desk: string; bar: string; food: string; ice: string };
  items: { pils: string; cola: string; frites: string; cone: string; merch: string };
  staff: Record<Role, string>;
  jwt: Record<Role, string>;
  devices: Record<'bar' | 'food' | 'desk' | 'console' | 'consoleAuditor', { id: string; token: string }>;
  api: (token: string) => { get(p: string, h?: Record<string, string>): Promise<Res>; post(p: string, b?: unknown, h?: Record<string, string>): Promise<Res>; put(p: string, b?: unknown): Promise<Res> };
  as: (role: Role) => ReturnType<World['api']>;
  newTag(opts?: { uid?: string }): Promise<{ tag_code: string; uid: string }>;
  topup(tag: { tag_code: string; uid: string }, tokens: number, method?: string): Promise<Res>;
  close(): Promise<void>;
}

const urls = () => ({ owner: process.env.DATABASE_URL_OWNER!, runtime: process.env.DATABASE_URL! });
let pinHash: string | undefined;

export function testConfig(over: Partial<Config> = {}): Config {
  return loadConfig({ DATABASE_URL: urls().runtime, DATABASE_URL_OWNER: urls().owner, LOG_LEVEL: 'silent' }, { PUBLIC_RATE_LIMIT_MAX: 1000, AUTH_RATE_LIMIT_MAX: 1000, ...over });
}

export async function makeWorld(opts: { event?: Record<string, unknown>; cfg?: Partial<Config>; status?: 'draft' | 'open' } = {}): Promise<World> {
  const owner = createSql(urls().owner, 3);
  const cfg = testConfig(opts.cfg);
  const fake = new FakePaymentProvider();
  const built = await buildApp({ cfg, payments: fake, logger: false });
  await built.app.ready();
  pinHash ??= await hashPin('1234');

  const organizerId = uuidv7();
  await owner`INSERT INTO organizers(id, legal_name, legal_form, address, enterprise_no, contact_email)
              VALUES (${organizerId}, 'Test ASBL', 'asbl_vzw', 'Rue 1, 1000 Bruxelles', '0123.456.789', 'org@example.test')`;
  const eventId = uuidv7();
  const ev = { country: 'BE', token_price_cents: 200, offline_cap_tokens: 10, max_balance_tokens: 100, max_topup_tokens: 50, ...opts.event };
  await owner`INSERT INTO events ${owner({ id: eventId, organizer_id: organizerId, name: 'Fete ' + eventId.slice(-6), status: opts.status ?? 'open', ...ev } as any)}`;

  const mkStand = async (name: string, kind: 'stand' | 'cashdesk') => {
    const id = uuidv7();
    await owner`INSERT INTO stands(id, event_id, name, kind) VALUES (${id}, ${eventId}, ${name}, ${kind})`;
    return id;
  };
  const stands = { desk: await mkStand('Caisse', 'cashdesk'), bar: await mkStand('Bar', 'stand'), food: await mkStand('Food', 'stand'), ice: await mkStand('Ice cream', 'stand') };
  const cat = uuidv7();
  await owner`INSERT INTO categories(id, event_id, name) VALUES (${cat}, ${eventId}, 'All')`;
  const mkItem = async (stand: string, name: string, price: number, vat: string, extra: Record<string, unknown> = {}) => {
    const id = uuidv7();
    await owner`INSERT INTO items ${owner({ id, event_id: eventId, stand_id: stand, category_id: cat, name, price_tokens: price, vat_category: vat, ...extra } as any)}`;
    return id;
  };
  const items = {
    pils: await mkItem(stands.bar, 'Pils 25cl', 1, 'ALCOHOL', { min_age: 16 }),
    cola: await mkItem(stands.bar, 'Cola', 1, 'DRINK_SOFT'),
    frites: await mkItem(stands.food, 'Frites', 3, 'FOOD'),
    cone: await mkItem(stands.ice, 'Cornet', 2, 'ICE_CREAM', { default_consumption_mode: 'takeaway' }),
    merch: await mkItem(stands.bar, 'Gobelet', 2, 'MERCH'),
  };

  const staff = {} as Record<Role, string>;
  for (const role of ['admin', 'cashier', 'vendor', 'auditor'] as Role[]) {
    staff[role] = uuidv7();
    await owner`INSERT INTO staff(id, name, role, pin_hash) VALUES (${staff[role]}, ${role + ' ' + staff[role].slice(-4)}, ${role}, ${pinHash})`;
    await owner`INSERT INTO staff_events(staff_id, event_id) VALUES (${staff[role]}, ${eventId})`;
  }
  const mkDevice = async (name: string, kind: string, stand: string | null, training = false) => {
    const token = 'dvc_' + randomBytes(24).toString('base64url');
    const r = await owner<{ id: string }[]>`INSERT INTO devices(event_id, stand_id, name, kind, training, token_hash) VALUES (${eventId}, ${stand}, ${name}, ${kind}, ${training}, ${sha256(token)}) RETURNING id`;
    return { id: r[0]!.id, token };
  };
  const devices = {
    bar: await mkDevice('Bar tablet', 'terminal', stands.bar),
    food: await mkDevice('Food tablet', 'terminal', stands.food),
    desk: await mkDevice('Desk', 'cashdesk', stands.desk),
    console: await mkDevice('Console', 'console', null),
    consoleAuditor: await mkDevice('Console 2', 'console', null),
  };
  const jwtFor = async (role: Role, d: { id: string }, sid: string | null) =>
    (await signJwt(cfg.JWT_SECRET, { sub: staff[role], did: d.id, eid: eventId, sid, role, trn: false }, 3600)).token;
  const jwt: Record<Role, string> = {
    admin: await jwtFor('admin', devices.console, null),
    cashier: await jwtFor('cashier', devices.desk, stands.desk),
    vendor: await jwtFor('vendor', devices.bar, stands.bar),
    auditor: await jwtFor('auditor', devices.consoleAuditor, null),
  };

  const api: World['api'] = (token) => {
    const call = async (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> => {
      const r = await built.app.inject({
        method, url: '/v1' + url, headers: { authorization: `Bearer ${token}`, ...headers },
        ...(body !== undefined ? { payload: body as any } : {}),
      });
      let parsed: any = undefined;
      try { parsed = r.body ? JSON.parse(r.body) : undefined; } catch { parsed = undefined; }
      return { status: r.statusCode, body: parsed, headers: r.headers, text: r.body };
    };
    return { get: (p, h) => call('GET', p, undefined, h), post: (p, b, h) => call('POST', p, b ?? {}, h), put: (p, b) => call('PUT', p, b) };
  };
  const as = (role: Role) => api(jwt[role]);

  const newTag = async (o: { uid?: string } = {}) => {
    const tag_code = newTagCode();
    const uid = o.uid ?? ('04' + randomBytes(6).toString('hex')).toUpperCase();
    await owner`INSERT INTO tags(tag_code, uid, chip_type, status) VALUES (${tag_code}, decode(${uid}, 'hex'), 'ntag215', 'active')`;
    return { tag_code, uid };
  };
  const topup = (tag: { tag_code: string; uid: string }, tokens: number, method = 'cash') =>
    as('cashier').post('/topups', {
      client_tx_id: uuidv7(), tag, payment_method: method, amount_cents: tokens * 200,
      ...(method === 'cash' ? {} : { external_ref: 'EXT-' + uuidv7() }),
    });

  return {
    built, cfg, owner, fake, eventId, organizerId, stands, items, staff, jwt, devices, api, as, newTag, topup,
    close: async () => { await built.app.close(); await owner.end({ timeout: 2 }); },
  };
}

export async function verifyOk(w: World): Promise<any> {
  const r = await w.as('auditor').get(`/events/${w.eventId}/ledger/verify`);
  return r.body;
}

export { postgres };
