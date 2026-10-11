import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { makeWorld, type World } from './helpers.js';
import { loadContract } from '../src/contract.js';
import { uuidv7 } from '../src/util/ids.js';

let w: World;
let validate: (name: string, data: unknown) => string | null;
beforeAll(async () => {
  w = await makeWorld();
  const { doc } = loadContract(w.cfg.OPENAPI_PATH);
  const ajv = new Ajv2020.default({ strict: false, allErrors: true });
  (addFormats as any).default(ajv);
  ajv.addFormat('int64', true);
  ajv.addFormat('int32', true);
  ajv.addSchema({ $id: 'openapi', components: doc.components });
  validate = (name, data) => {
    const v = ajv.getSchema('openapi#/components/schemas/' + name) ?? ajv.compile({ $ref: 'openapi#/components/schemas/' + name });
    return v(data) ? null : JSON.stringify(v.errors?.slice(0, 5));
  };
});
afterAll(async () => { await w.close(); });

describe('responses conform to the OpenAPI schemas', () => {
  it('core resources', async () => {
    expect(validate('Order', {}), 'validator must not be vacuous').not.toBeNull();
    const tag = await w.newTag();
    const t = await w.topup(tag, 10);
    expect(validate('Topup', t.body), 'Topup').toBeNull();
    const o = await w.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.bar, tag, tip_tokens: 1, age_check_confirmed: true, lines: [{ item_id: w.items.pils, qty: 2 }] });
    expect(validate('Order', o.body), 'Order').toBeNull();
    const r = await w.as('vendor').post(`/orders/${o.body.id}/refunds`, { client_tx_id: uuidv7(), reason_code: 'customer_request' });
    expect(validate('Order', r.body), 'Refund').toBeNull();
    expect(validate('TagInfo', (await w.as('cashier').get(`/tags/${tag.tag_code}?uid=${tag.uid}`)).body), 'TagInfo').toBeNull();
    expect(validate('Catalog', (await w.as('vendor').get(`/events/${w.eventId}/catalog`)).body), 'Catalog').toBeNull();
    expect(validate('JournalEntry', (await w.as('admin').get(`/journals/${o.body.journal_id}`)).body), 'JournalEntry').toBeNull();
    expect(validate('PublicTagPage', (await w.api('').get(`/public/tags/${tag.tag_code}`)).body), 'PublicTagPage').toBeNull();
    expect(validate('LedgerVerification', (await w.as('auditor').get(`/events/${w.eventId}/ledger/verify`)).body), 'LedgerVerification').toBeNull();
    expect(validate('LedgerHead', (await w.as('auditor').get(`/events/${w.eventId}/ledger/head`)).body), 'LedgerHead').toBeNull();
    const co = await w.as('cashier').post('/cashouts', { client_tx_id: uuidv7(), tag, method: 'cash', reason_code: 'customer_request', tokens: 2 });
    expect(validate('Cashout', co.body), 'Cashout').toBeNull();
    const z = await w.as('vendor').get(`/events/${w.eventId}/reports/z?stand_id=${w.stands.bar}&business_date=${o.body.business_date}`);
    expect(validate('ZReport', z.body), 'ZReport preview').toBeNull();
    const sealed = await w.as('vendor').post(`/events/${w.eventId}/z-reports`, { client_tx_id: uuidv7(), stand_id: w.stands.bar, business_date: o.body.business_date });
    expect(validate('ZReport', sealed.body), 'ZReport sealed').toBeNull();
    for (const [name, path] of [['SalesReport', 'reports/sales?group_by=item'], ['VatReport', 'reports/vat'], ['TopupsReport', 'reports/topups'], ['LiabilityReport', 'reports/liability'], ['TipsReport', 'reports/tips']] as const) {
      expect(validate(name, (await w.as('auditor').get(`/events/${w.eventId}/${path}`)).body), name).toBeNull();
    }
    expect(validate('Event', (await w.as('admin').get(`/events/${w.eventId}`)).body), 'Event').toBeNull();
    const rcp = await w.as('cashier').post(`/receipts/topup/${t.body.id}/prints`);
    expect(validate('Receipt', rcp.body), 'Receipt').toBeNull();
    const err = await w.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.bar, tag, lines: [{ item_id: w.items.cola, qty: 99 }] });
    expect(validate('Error', err.body), 'Error').toBeNull();
    const sync = await w.api(w.devices.bar.token).post('/sync/batch', { batch_id: uuidv7(), items: [{ type: 'order', staff_id: w.staff.vendor, payload: { client_tx_id: uuidv7(), stand_id: w.stands.bar, tag, lines: [{ item_id: w.items.cola, qty: 1 }], client_created_at: new Date().toISOString() } }] });
    expect(validate('SyncBatchResponse', sync.body), 'SyncBatchResponse').toBeNull();
  });
});
