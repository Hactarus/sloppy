import postgres from 'postgres';

/** Any query runner: the pool or a transaction. */
export type Q = postgres.Sql<Record<string, never>>;
export type Row = Record<string, any>;

/**
 * Pool factory. int8 is parsed to JS numbers (all amounts are far below 2^53); timestamps stay Date objects.
 * The runtime pool connects as the `jeton_api` login role (member of jeton_app), never as the table owner.
 */
export function createSql(url: string, max = 10, opts: { onnotice?: boolean } = {}): Q {
  return postgres(url, {
    max,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: opts.onnotice ? undefined : () => {},
    types: {
      // `date` columns stay plain 'YYYY-MM-DD' strings (business dates are calendar dates, not instants)
      date: { to: 1082, from: [1082], serialize: (x: unknown) => String(x), parse: (x: string) => x },
      bigint: {
        to: 20,
        from: [20],
        serialize: (x: unknown) => String(x),
        parse: (x: string) => Number(x),
      },
    },
    connection: { application_name: 'jeton-server', timezone: 'UTC' },
  }) as unknown as Q;
}

/** Run `fn` in a transaction. */
export function inTx<T>(sql: Q, fn: (tx: Q) => Promise<T>): Promise<T> {
  return sql.begin((tx) => fn(tx as unknown as Q)) as Promise<T>;
}

/** Lock key of an event for application level serialisation of ledger writers. */
export async function lockEvent(tx: Q, eventId: string): Promise<void> {
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${'jeton:event:' + eventId}, 0))`;
}
