import type { Operation, Role } from '../contract.js';

/** Who is calling: an enrolled device, optionally with a logged-in staff member. */
export interface Principal {
  deviceId: string;
  deviceKind: 'terminal' | 'cashdesk' | 'console';
  eventId: string;
  standId: string | null;
  training: boolean;
  /** Present for staffAuth (JWT) requests only. */
  staff?: { id: string; name: string; role: Role };
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
    operationId?: string;
  }
  interface FastifyContextConfig {
    op?: Operation;
  }
}

export function requireStaff(p: Principal | undefined): asserts p is Principal & { staff: NonNullable<Principal['staff']> } {
  if (!p?.staff) throw new Error('route misconfigured: staff principal required');
}
