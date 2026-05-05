// Crypto helpers — Workers WebCrypto only. All key material treated as opaque; never logged.
//
// PIN hashing uses PBKDF2-SHA256 at 600k iters (OWASP minimum for 2023+).
// Argon2id is the better choice but requires bundling a WASM module via
// wrangler [[wasm_modules]] — Workers reject runtime WebAssembly.compile.
// That bundling is a Phase 4 hardening task; PBKDF2-SHA256 is the documented
// interim choice and is referenced by name in the threat model.

import type { Env } from '../index';

const enc = new TextEncoder();

// === Hashes ===

export async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const data = typeof input === 'string' ? enc.encode(input) : new Uint8Array(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// === Bytes/base64 ===

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(out);
  return out;
}

export function bytesToB64(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// === PBKDF2-SHA256 PIN hashing (Phase 4: swap for bundled Argon2id WASM) ===

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
  if (hash.length !== expectedHashB64.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ expectedHashB64.charCodeAt(i);
  return diff === 0;
}

// === Master-key DEK wrapping (KMS-style under a Workers Secret) ===
// Wrap format: iv (12) || ciphertext || tag (16). Stored as a single BLOB.

let masterKeyCache: CryptoKey | null = null;

async function getMasterKey(env: Env): Promise<CryptoKey> {
  if (masterKeyCache) return masterKeyCache;
  if (!env.MASTER_KEY) throw new Error('MASTER_KEY not configured');
  masterKeyCache = await crypto.subtle.importKey(
    'raw', b64ToBytes(env.MASTER_KEY), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
  );
  return masterKeyCache;
}

function asBuf(u: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(u.byteLength));
  out.set(u);
  return out;
}

export async function aeadEncrypt(env: Env, plaintext: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
  const key = await getMasterKey(env);
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad ? asBuf(aad) : undefined },
    key, asBuf(plaintext),
  );
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return out;
}

export async function aeadDecrypt(env: Env, blob: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
  const key = await getMasterKey(env);
  const copy = asBuf(blob);
  const iv = copy.subarray(0, 12);
  const ct = copy.subarray(12);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad ? asBuf(aad) : undefined },
    key, ct,
  );
  return new Uint8Array(pt);
}

// === Ed25519 audit log signing ===

let signingKeyCache: CryptoKey | null = null;
let publicKeyCache: CryptoKey | null = null;

async function getSigningKey(env: Env): Promise<CryptoKey> {
  if (signingKeyCache) return signingKeyCache;
  if (!env.LOG_SIGNING_KEY) throw new Error('LOG_SIGNING_KEY not configured');
  signingKeyCache = await crypto.subtle.importKey(
    'pkcs8', b64ToBytes(env.LOG_SIGNING_KEY), { name: 'Ed25519' }, false, ['sign'],
  );
  return signingKeyCache;
}

export async function getPublicKey(env: Env): Promise<CryptoKey> {
  if (publicKeyCache) return publicKeyCache;
  if (!env.LOG_PUBLIC_KEY) throw new Error('LOG_PUBLIC_KEY not configured');
  publicKeyCache = await crypto.subtle.importKey(
    'spki', b64ToBytes(env.LOG_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify'],
  );
  return publicKeyCache;
}

export async function signEd25519(env: Env, msg: Uint8Array): Promise<Uint8Array> {
  const key = await getSigningKey(env);
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key, asBuf(msg));
  return new Uint8Array(sig);
}

export async function verifyEd25519(env: Env, msg: Uint8Array, sig: Uint8Array): Promise<boolean> {
  const key = await getPublicKey(env);
  return crypto.subtle.verify({ name: 'Ed25519' }, key, asBuf(sig), asBuf(msg));
}
