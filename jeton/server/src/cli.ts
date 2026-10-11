/**
 * Operator CLI (runs as the table owner, never from the HTTP server).
 *   migrate                               apply db/migrations and create/update the runtime login role from DATABASE_URL
 *   create-admin --name N --pin 1234 (--event UUID | --new-event "Name")
 *                                         create an admin and print a console enrolment code (bootstrap, ADR 0010)
 *   seed-demo [--tags 20]                 demo event (BE) with stands Bar / Food / Ice cream and a cash desk
 *   verify-chain --event UUID             verify the hash chain in the database
 *   verify-chain --event UUID --journal journal.csv --postings postings.csv     verify CSV exports offline
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadConfig } from './config.js';
import { createSql, type Q, type Row } from './db.js';
import { migrate, ensureRuntimeRole } from './migrate.js';
import { hashPin } from './auth/pin.js';
import { derivedUuid, newEnrollmentCode, newTagCode, uuidv7 } from './util/ids.js';
import { sha256 } from './util/crypto.js';
import { verifyCsvExports, verifyEventChain } from './ledger/verify.js';

const cfg = loadConfig();
const log = (...a: unknown[]) => console.log(...a);

async function enrolCode(sql: Q, eventId: string, kind: string, standId: string | null, training = false): Promise<string> {
  const code = newEnrollmentCode();
  await sql`INSERT INTO enrollment_codes(code_hash, event_id, stand_id, kind, training, expires_at)
            VALUES (${sha256(code)}, ${eventId}, ${standId}, ${kind}, ${training}, now() + interval '15 minutes')`;
  return code;
}

async function createAdmin(args: { name: string; pin: string; event?: string; 'new-event'?: string }) {
  if (!/^[0-9]{4,8}$/.test(args.pin)) throw new Error('--pin must be 4-8 digits');
  const sql = createSql(cfg.DATABASE_URL_OWNER, 2, { onnotice: false });
  try {
    let eventId = args.event;
    if (!eventId) {
      if (!args['new-event']) throw new Error('give --event <uuid> or --new-event "<name>"');
      const org = (await sql<Row[]>`INSERT INTO organizers(legal_name, legal_form, address, enterprise_no) VALUES ('To be completed', 'other', 'To be completed', 'TBD') RETURNING id`)[0]!;
      eventId = (await sql<Row[]>`INSERT INTO events(organizer_id, name, country) VALUES (${org.id}, ${args['new-event']}, 'BE') RETURNING id`)[0]!.id as string;
      log('created draft event', eventId);
    }
    const id = uuidv7();
    await sql`INSERT INTO staff(id, name, role, pin_hash) VALUES (${id}, ${args.name}, 'admin', ${await hashPin(args.pin)})`;
    await sql`INSERT INTO staff_events(staff_id, event_id) VALUES (${id}, ${eventId})`;
    const code = await enrolCode(sql, eventId, 'console', null);
    log(`admin ${id} created; console enrolment code (15 min, single use): ${code}`);
  } finally {
    await sql.end();
  }
}

const DEMO = { event: derivedUuid('demo', 'event'), org: derivedUuid('demo', 'org') };
const demoId = (k: string) => derivedUuid('demo', k);

async function seedDemo(nTags: number) {
  const sql = createSql(cfg.DATABASE_URL_OWNER, 2, { onnotice: false });
  try {
    await sql`INSERT INTO organizers(id, legal_name, legal_form, address, enterprise_no, vat_no, contact_email)
              VALUES (${DEMO.org}, 'Fête de l''école ASBL', 'asbl_vzw', 'Rue de l''Exemple 1, 1000 Bruxelles', '0123.456.789', NULL, 'tresorier@example.org')
              ON CONFLICT (id) DO NOTHING`;
    await sql`INSERT INTO events(id, organizer_id, name, country, status, refundable_until, policy_version, terms_version)
              VALUES (${DEMO.event}, ${DEMO.org}, 'Fête de l''école (demo)', 'BE', 'open', now() + interval '30 days', 'policy-2026-07', 'tos-2026-07')
              ON CONFLICT (id) DO NOTHING`;
    const stands: Array<[string, string, string]> = [['desk', 'Caisse', 'cashdesk'], ['bar', 'Bar', 'stand'], ['food', 'Food', 'stand'], ['ice', 'Ice cream', 'stand']];
    for (const [k, name, kind] of stands) {
      await sql`INSERT INTO stands(id, event_id, name, name_i18n, kind, sort_order) VALUES (${demoId(k)}, ${DEMO.event}, ${name}, ${sql.json({ en: name })}, ${kind}, ${stands.findIndex((s) => s[0] === k)})
                ON CONFLICT (id) DO NOTHING`;
    }
    const cats: Array<[string, string]> = [['drinks', 'Boissons'], ['food', 'Restauration'], ['ice', 'Glaces'], ['merch', 'Divers']];
    for (const [k, name] of cats) await sql`INSERT INTO categories(id, event_id, name) VALUES (${demoId('cat-' + k)}, ${DEMO.event}, ${name}) ON CONFLICT (id) DO NOTHING`;
    // [stand, category, name, tokens, vat category, default mode, min_age, icon]
    const items: Array<[string, string, string, number, string, string, number | null, string]> = [
      ['bar', 'drinks', 'Pils 25cl', 1, 'ALCOHOL', 'on_site', 16, 'beer'], ['bar', 'drinks', 'Pils 50cl', 2, 'ALCOHOL', 'on_site', 16, 'beer'],
      ['bar', 'drinks', 'Vin rouge', 2, 'ALCOHOL', 'on_site', 16, 'wine'], ['bar', 'drinks', 'Cola', 1, 'DRINK_SOFT', 'on_site', null, 'cup'],
      ['bar', 'drinks', 'Eau pétillante', 1, 'DRINK_SOFT', 'on_site', null, 'bottle'], ['bar', 'drinks', 'Café', 1, 'DRINK_SOFT', 'on_site', null, 'coffee'],
      ['bar', 'merch', 'Gobelet réutilisable', 1, 'MERCH', 'takeaway', null, 'cup'],
      ['food', 'food', 'Frites', 2, 'FOOD', 'on_site', null, 'fries'], ['food', 'food', 'Hamburger', 4, 'FOOD', 'on_site', null, 'burger'],
      ['food', 'food', 'Saucisse', 3, 'FOOD', 'on_site', null, 'sausage'], ['food', 'food', 'Croque-monsieur', 3, 'FOOD', 'on_site', null, 'sandwich'],
      ['food', 'food', 'Sandwich emporté', 3, 'FOOD', 'takeaway', null, 'sandwich'],
      ['ice', 'ice', 'Cornet', 1, 'ICE_CREAM', 'takeaway', null, 'icecream'], ['ice', 'ice', 'Coupe glacée', 3, 'ICE_CREAM', 'on_site', null, 'sundae'],
      ['ice', 'ice', 'Gaufre', 2, 'FOOD', 'takeaway', null, 'waffle'],
    ];
    let n = 0;
    for (const [s, c, name, price, vat, mode, age, icon] of items) {
      await sql`INSERT INTO items(id, event_id, stand_id, category_id, name, price_tokens, vat_category, default_consumption_mode, min_age, icon, sort_order)
                VALUES (${demoId('item-' + name)}, ${DEMO.event}, ${demoId(s)}, ${demoId('cat-' + c)}, ${name}, ${price}, ${vat}, ${mode}, ${age}, ${icon}, ${n++})
                ON CONFLICT (id) DO NOTHING`;
    }
    const staff: Array<[string, string, string, string]> = [['admin', 'Alice (admin)', 'admin', '1111'], ['cashier', 'Caroline (caisse)', 'cashier', '2222'],
      ['vendor', 'Victor (bar)', 'vendor', '3333'], ['auditor', 'Alain (comptable)', 'auditor', '4444']];
    for (const [k, name, role, pin] of staff) {
      await sql`INSERT INTO staff(id, name, role, pin_hash) VALUES (${demoId('staff-' + k)}, ${name}, ${role}, ${await hashPin(pin)}) ON CONFLICT (id) DO NOTHING`;
      await sql`INSERT INTO staff_events(staff_id, event_id) VALUES (${demoId('staff-' + k)}, ${DEMO.event}) ON CONFLICT DO NOTHING`;
    }
    const have = (await sql<Row[]>`SELECT count(*)::int AS n FROM tags WHERE enrolled_event_id = ${DEMO.event}`)[0]!.n as number;
    for (let i = have; i < nTags; i++) {
      const uid = ('04' + (await import('node:crypto')).randomBytes(6).toString('hex')).toUpperCase();
      await sql`INSERT INTO tags(tag_code, uid, chip_type, status, enrolled_event_id, activated_at) VALUES (${newTagCode()}, decode(${uid}, 'hex'), 'ntag215', 'active', ${DEMO.event}, now())`;
    }
    log('Demo event', DEMO.event, '(BE, token = EUR 2.00)');
    log('Staff PINs: admin 1111, cashier 2222, vendor 3333, auditor 4444');
    log('Enrolment codes (15 min, single use):');
    log('  console      ', await enrolCode(sql, DEMO.event, 'console', null));
    log('  cash desk    ', await enrolCode(sql, DEMO.event, 'cashdesk', demoId('desk')));
    for (const s of ['bar', 'food', 'ice']) log(`  terminal ${s.padEnd(5)}`, await enrolCode(sql, DEMO.event, 'terminal', demoId(s)));
    const t = await sql<Row[]>`SELECT tag_code, upper(encode(uid,'hex')) AS uid FROM tags WHERE enrolled_event_id = ${DEMO.event} ORDER BY created_at LIMIT 3`;
    log('Sample tags:', t.map((x) => `${cfg.PUBLIC_BASE_URL}/t/${x.tag_code} (uid ${x.uid})`).join('\n             '));
  } finally {
    await sql.end();
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' }, pin: { type: 'string' }, event: { type: 'string' }, 'new-event': { type: 'string' }, tags: { type: 'string' },
      journal: { type: 'string' }, postings: { type: 'string' },
    },
  });
  switch (cmd) {
    case 'migrate': {
      const r = await migrate(cfg.DATABASE_URL_OWNER, cfg.MIGRATIONS_DIR, log);
      log(`applied ${r.applied.length}, up to date ${r.skipped.length}`);
      try {
        log('runtime role:', await ensureRuntimeRole(cfg.DATABASE_URL_OWNER, cfg.DATABASE_URL));
      } catch (e) {
        log('could not create the runtime role (create it by hand, see db/README.md):', String(e));
      }
      break;
    }
    case 'create-admin':
      if (!values.name || !values.pin) throw new Error('usage: create-admin --name N --pin 1234 (--event UUID | --new-event "Name")');
      await createAdmin({ name: values.name, pin: values.pin, event: values.event, 'new-event': values['new-event'] });
      break;
    case 'seed-demo':
      await seedDemo(Number(values.tags ?? 20));
      break;
    case 'verify-chain': {
      if (!values.event) throw new Error('--event is required');
      let res;
      if (values.journal && values.postings) res = verifyCsvExports(values.event, readFileSync(values.journal, 'utf8'), readFileSync(values.postings, 'utf8'));
      else {
        const sql = createSql(cfg.DATABASE_URL_OWNER, 2, { onnotice: false });
        try {
          res = await verifyEventChain(sql, values.event);
        } finally {
          await sql.end();
        }
      }
      log(res.ok ? `OK: ${res.checked} journals, head seq ${res.headSeq}, head hash ${res.headHash}` : `FAILED at seq ${res.firstBadSeq}: ${res.reason}`);
      process.exitCode = res.ok ? 0 : 1;
      break;
    }
    default:
      log('commands: migrate | create-admin | seed-demo | verify-chain (see header of src/cli.ts)');
      process.exitCode = cmd ? 2 : 0;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
