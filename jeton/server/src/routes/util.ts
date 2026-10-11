import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { assertEventAccess } from '../auth/plugin.js';
import { actorOf, type Actor } from '../domain/common.js';
import { parse, zUuid } from '../http.js';
import type { Principal } from '../auth/principal.js';

export const principal = (req: FastifyRequest): Principal => {
  if (!req.principal) throw new AppError('UNAUTHENTICATED', 'Missing credentials');
  return req.principal;
};

export const actor = (req: FastifyRequest): Actor => actorOf(principal(req));

/** Path event id, checked against the device (admins of console devices may address other events). */
export function eventParam(req: FastifyRequest): string {
  const { event_id } = parse(z.object({ event_id: zUuid }), req.params, 'params');
  assertEventAccess(principal(req), event_id);
  return event_id;
}

/** Actor bound to the path event (differs from the device event only for console admins). */
export function actorFor(req: FastifyRequest, eventId: string): Actor {
  return { ...actor(req), eventId };
}

export const idParam = (req: FastifyRequest, name: string): string => (parse(z.object({ [name]: zUuid }), req.params, 'params') as Record<string, string>)[name]!;
export const query = <T extends z.ZodType>(req: FastifyRequest, s: T): z.output<T> => parse(s, req.query, 'query');
export const boolQ = z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true');
