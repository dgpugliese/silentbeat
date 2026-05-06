// SilentBeat — shared frontend client. Vanilla JS, no module bundler.
// Loaded as a plain <script> on every page; exposes window.SB.

(function () {
  const SB = {
    // --- session ---
    getSession() { return localStorage.getItem('sb_session'); },
    setSession(t) { localStorage.setItem('sb_session', t); },
    clearSession() { localStorage.removeItem('sb_session'); },
    isSignedIn() { return !!this.getSession(); },

    // --- API ---
    async api(path, opts = {}) {
      const headers = new Headers(opts.headers || {});
      const session = this.getSession();
      if (session) headers.set('Authorization', `Bearer ${session}`);
      if (opts.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      const r = await fetch(path, { ...opts, headers });
      let body;
      try { body = await r.json(); } catch { body = null; }
      if (!r.ok) {
        const err = new Error((body && (body.error || body.message)) || r.statusText);
        err.status = r.status;
        err.body = body;
        throw err;
      }
      return body;
    },

    requireAuth(redirect) {
      if (!this.isSignedIn()) location.replace(redirect || '/signin.html');
    },

    bytesToB64(b) {
      let s = '';
      for (const x of b) s += String.fromCharCode(x);
      return btoa(s);
    },
    b64ToBytes(s) {
      const bin = atob(s);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    },

    // Client-side AES-GCM payload encryption. Returns ciphertext blob (iv||ct||tag) and K.
    async encryptPayload(plaintextBytes) {
      const K = crypto.getRandomValues(new Uint8Array(32));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await crypto.subtle.importKey('raw', K, { name: 'AES-GCM' }, false, ['encrypt']);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintextBytes));
      const blob = new Uint8Array(iv.length + ct.length);
      blob.set(iv, 0);
      blob.set(ct, iv.length);
      return { blob, K };
    },

    async decryptPayload(blob, K) {
      if (blob.length < 28) throw new Error('payload too short');
      const iv = blob.subarray(0, 12);
      const ct = blob.subarray(12);
      const key = await crypto.subtle.importKey('raw', K, { name: 'AES-GCM' }, false, ['decrypt']);
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
    },

    // 32-byte XOR. K = shareA ⊕ shareB.
    splitKey(K) {
      const shareA = crypto.getRandomValues(new Uint8Array(32));
      const shareB = new Uint8Array(32);
      for (let i = 0; i < 32; i++) shareB[i] = K[i] ^ shareA[i];
      return { shareA, shareB };
    },
    combineShares(a, b) {
      if (a.length !== b.length) throw new Error('share length mismatch');
      const k = new Uint8Array(a.length);
      for (let i = 0; i < a.length; i++) k[i] = a[i] ^ b[i];
      return k;
    },

    // HKDF-SHA-256 over ECDH shared bits, with a fixed label for domain separation.
    // Returns a 32-byte AES-GCM key. Both sides must derive with the same label.
    async _hkdfAesKey(sharedBits, usages) {
      const ikm = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
      const info = new TextEncoder().encode('silentbeat/ecies/v2/shareB');
      const salt = new Uint8Array(32);
      return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt, info },
        ikm, { name: 'AES-GCM', length: 256 }, false, usages,
      );
    },

    // ECIES under P-256: ephemeral keypair, ECDH → HKDF-SHA-256 → AES-GCM key.
    // Output is JSON-serializable so it round-trips through the database.
    async eciesEncrypt(plaintextBytes, recipientPubKeyJwk) {
      const recipientPub = await crypto.subtle.importKey(
        'jwk', recipientPubKeyJwk,
        { name: 'ECDH', namedCurve: 'P-256' }, false, [],
      );
      const eph = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
      );
      const sharedBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: recipientPub }, eph.privateKey, 256,
      );
      const aesKey = await this._hkdfAesKey(sharedBits, ['encrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintextBytes));
      const ephPubJwk = await crypto.subtle.exportKey('jwk', eph.publicKey);
      return { v: 2, ephPub: ephPubJwk, iv: this.bytesToB64(iv), ct: this.bytesToB64(ct) };
    },

    async eciesDecrypt(envelope, privateKeyJwk) {
      if (!envelope || envelope.v !== 2) throw new Error('unknown envelope version');
      const priv = await crypto.subtle.importKey(
        'jwk', privateKeyJwk,
        { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'],
      );
      const ephPub = await crypto.subtle.importKey(
        'jwk', envelope.ephPub,
        { name: 'ECDH', namedCurve: 'P-256' }, false, [],
      );
      const sharedBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: ephPub }, priv, 256,
      );
      const aesKey = await this._hkdfAesKey(sharedBits, ['decrypt']);
      const iv = this.b64ToBytes(envelope.iv);
      const ct = this.b64ToBytes(envelope.ct);
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct));
    },

    // --- WebAuthn (passkeys) ---
    // simplewebauthn returns base64url-encoded fields; navigator.credentials wants ArrayBuffers.
    // These helpers translate both directions.
    bytesToB64url(b) {
      return this.bytesToB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    b64urlToBytes(s) {
      const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
      return this.b64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
    },

    _prepCreate(opts) {
      const o = { ...opts };
      o.challenge = this.b64urlToBytes(opts.challenge);
      o.user = { ...opts.user, id: this.b64urlToBytes(opts.user.id) };
      if (Array.isArray(opts.excludeCredentials)) {
        o.excludeCredentials = opts.excludeCredentials.map((c) => ({ ...c, id: this.b64urlToBytes(c.id) }));
      }
      return o;
    },
    _prepGet(opts) {
      const o = { ...opts };
      o.challenge = this.b64urlToBytes(opts.challenge);
      if (Array.isArray(opts.allowCredentials)) {
        o.allowCredentials = opts.allowCredentials.map((c) => ({ ...c, id: this.b64urlToBytes(c.id) }));
      }
      return o;
    },
    _credToJson(cred) {
      const out = {
        id: cred.id,
        rawId: this.bytesToB64url(new Uint8Array(cred.rawId)),
        type: cred.type,
        clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
        response: {},
      };
      const r = cred.response;
      if (r.attestationObject) {
        out.response.attestationObject = this.bytesToB64url(new Uint8Array(r.attestationObject));
        out.response.clientDataJSON = this.bytesToB64url(new Uint8Array(r.clientDataJSON));
        if (r.getTransports) out.response.transports = r.getTransports();
      } else {
        out.response.authenticatorData = this.bytesToB64url(new Uint8Array(r.authenticatorData));
        out.response.clientDataJSON = this.bytesToB64url(new Uint8Array(r.clientDataJSON));
        out.response.signature = this.bytesToB64url(new Uint8Array(r.signature));
        if (r.userHandle) out.response.userHandle = this.bytesToB64url(new Uint8Array(r.userHandle));
      }
      return out;
    },

    async registerPasskey() {
      const opts = await this.api('/api/auth/passkey/register/begin', { method: 'POST', body: '{}' });
      const cred = await navigator.credentials.create({ publicKey: this._prepCreate(opts) });
      if (!cred) throw new Error('passkey creation cancelled');
      return this.api('/api/auth/passkey/register/finish', {
        method: 'POST',
        body: JSON.stringify(this._credToJson(cred)),
      });
    },

    async authenticateWithPasskey(email) {
      const body = JSON.stringify(email ? { email } : {});
      const begin = await this.api('/api/auth/passkey/authenticate/begin', { method: 'POST', body });
      const { challengeId, ...opts } = begin;
      const cred = await navigator.credentials.get({ publicKey: this._prepGet(opts) });
      if (!cred) throw new Error('passkey assertion cancelled');
      const r = await this.api('/api/auth/passkey/authenticate/finish', {
        method: 'POST',
        body: JSON.stringify({ challengeId, response: this._credToJson(cred) }),
      });
      if (r.session) this.setSession(r.session);
      return r;
    },

    // Local stash for shareB between create and finalize.
    stashShareB(switchId, shareB) {
      localStorage.setItem('sb_shareB:' + switchId, this.bytesToB64(shareB));
    },
    readShareB(switchId) {
      const s = localStorage.getItem('sb_shareB:' + switchId);
      return s ? this.b64ToBytes(s) : null;
    },
    clearShareB(switchId) {
      localStorage.removeItem('sb_shareB:' + switchId);
    },

    // --- formatting ---
    msToDhms(ms) {
      if (ms <= 0) return { d: 0, h: 0, m: 0, s: 0, expired: true };
      const s = Math.floor(ms / 1000);
      return {
        d: Math.floor(s / 86400),
        h: Math.floor((s % 86400) / 3600),
        m: Math.floor((s % 3600) / 60),
        s: s % 60,
        expired: false,
      };
    },
    pad(n) { return String(n).padStart(2, '0'); },
    fmtUTC(t) {
      return new Date(t).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false,
      }) + ' UTC';
    },
    timeAgo(t) {
      const ms = Date.now() - t;
      const s = Math.floor(ms / 1000);
      if (s < 60) return s + 's ago';
      const m = Math.floor(s / 60);
      if (m < 60) return m + 'm ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      const d = Math.floor(h / 24);
      return d + 'd ago';
    },
  };

  window.SB = SB;
})();
