import { SignJWT, jwtVerify, errors } from 'jose';
import { AppError } from '../errors.js';
import type { Role } from '../contract.js';

export interface Claims {
  sub: string; // staff id
  did: string; // device id
  eid: string; // event id
  sid: string | null; // stand id
  role: Role;
  trn: boolean;
}

export async function signJwt(secret: string, claims: Claims, ttlSeconds: number): Promise<{ token: string; expiresAt: Date }> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = await new SignJWT({ did: claims.did, eid: claims.eid, sid: claims.sid, role: claims.role, trn: claims.trn })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt: new Date(exp * 1000) };
}

export async function verifyJwt(secret: string, token: string): Promise<Claims> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
    return payload as unknown as Claims;
  } catch (e) {
    if (e instanceof errors.JWTExpired) throw new AppError('TOKEN_EXPIRED', 'Session expired, log in again');
    throw new AppError('UNAUTHENTICATED', 'Invalid credentials');
  }
}
