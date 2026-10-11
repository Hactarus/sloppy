import { hash, verify } from '@node-rs/argon2';

// argon2id (Algorithm.Argon2id = 2), OWASP-ish parameters
const OPTS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPin = (pin: string): Promise<string> => hash(pin, OPTS);
export async function verifyPin(phc: string, pin: string): Promise<boolean> {
  try {
    return await verify(phc, pin);
  } catch {
    return false;
  }
}
