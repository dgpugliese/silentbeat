// Crypto helpers — Workers WebCrypto + argon2-wasm-edge for Argon2id PIN hashing.
// All key material treated as opaque; never logged.

import { argon2id as argon2idWasm, argon2Verify, setWASMModules } from 'argon2-wasm-edge';
// @ts-expect-error wasm module imports are typed by wrangler at build time
import argon2WASM from 'argon2-wasm-edge/wasm/argon2.wasm';
// @ts-expect-error
import blake2bWASM from 'argon2-wasm-edge/wasm/blake2b.wasm';
import type { Env } from '../index';

setWASMModules({ argon2WASM, blake2bWASM });

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

// === Argon2id PIN hashing (WASM via argon2-wasm-edge) ===
// Output is PHC-encoded: salt + params are embedded in the hash string.
// Iterations + memory tuned to be safe under Workers CPU limits while still
// providing meaningful work per guess. Brute-force defense is the rate
// limiter (5/hr/switch); argon's role is to slow a DB-dump attacker.

const ARGON_PARAMS = {
  parallelism: 1,
  iterations: 64,
  memorySize: 4096, // 4 MiB
  hashLength: 32,
  outputType: 'encoded' as const,
};

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  return argon2idWasm({ ...ARGON_PARAMS, password: pin, salt });
}

export async function verifyPin(pin: string, encodedHash: string): Promise<boolean> {
  return argon2Verify({ password: pin, hash: encodedHash });
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
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
