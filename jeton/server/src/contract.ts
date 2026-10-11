import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export type Role = 'admin' | 'cashier' | 'vendor' | 'auditor';
export type Scheme = 'staffAuth' | 'deviceAuth';

export interface Operation {
  operationId: string;
  method: string; // upper case
  path: string; // OpenAPI template, e.g. /events/{event_id}/catalog
  fastifyPath: string; // /events/:event_id/catalog
  roles: Role[] | null; // x-roles; null = no role restriction
  /** Accepted security schemes; empty array = public. */
  schemes: Scheme[];
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * The OpenAPI file is the source of truth: routes, roles (`x-roles`) and security schemes are read from it at startup,
 * so the role guard cannot drift from the contract.
 */
export function loadContract(path: string): { ops: Operation[]; byKey: Map<string, Operation>; doc: any } {
  const doc = parse(readFileSync(path, 'utf8')) as any;
  const defaultSecurity: any[] = doc.security ?? [];
  const ops: Operation[] = [];
  for (const [p, item] of Object.entries<any>(doc.paths ?? {})) {
    for (const m of METHODS) {
      const op = item[m];
      if (!op) continue;
      const sec: any[] = op.security ?? defaultSecurity;
      const schemes = [...new Set(sec.flatMap((s) => Object.keys(s)))] as Scheme[];
      ops.push({
        operationId: op.operationId,
        method: m.toUpperCase(),
        path: p,
        fastifyPath: p.replace(/\{([^}]+)\}/g, ':$1'),
        roles: (op['x-roles'] as Role[] | undefined) ?? null,
        schemes,
      });
    }
  }
  const byKey = new Map(ops.map((o) => [`${o.method} ${o.fastifyPath}`, o]));
  return { ops, byKey, doc };
}
