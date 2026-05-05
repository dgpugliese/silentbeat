// Crypto helpers — Workers WebCrypto only. No node-crypto.
// Real KMS-backed key wrap and Ed25519 signing arrive in Phase 3.

const enc = new TextEncoder();

export async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const data = typeof input === 'string' ? enc.encode(input) : new Uint8Array(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function bytesToB64(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// PIN hashing: WebCrypto has no Argon2. We use PBKDF2-SHA256 with high iterations
// as a Workers-native placeholder until we ship a WASM Argon2 in Phase 3.
const PIN_ITERATIONS = 600_000;

export async function hashPin(pin: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? b64ToBytes(saltB64) : randomBytes(16);
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PIN_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256,
  );
  return { hash: bytesToB64(new Uint8Array(bits)), salt: bytesToB64(salt) };
}

export async function verifyPin(pin: string, expectedHashB64: string, saltB64: string): Promise<boolean> {
  const { hash } = await hashPin(pin, saltB64);
  // Constant-time compare
  if (hash.length !== expectedHashB64.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ expectedHashB64.charCodeAt(i);
  return diff === 0;
}
