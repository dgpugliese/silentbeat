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

    // ECIES under P-256: ephemeral keypair, ECDH → AES-GCM key, encrypt plaintext.
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
      const aesKey = await crypto.subtle.importKey('raw', sharedBits, { name: 'AES-GCM' }, false, ['encrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintextBytes));
      const ephPubJwk = await crypto.subtle.exportKey('jwk', eph.publicKey);
      return { v: 1, ephPub: ephPubJwk, iv: this.bytesToB64(iv), ct: this.bytesToB64(ct) };
    },

    async eciesDecrypt(envelope, privateKeyJwk) {
      if (!envelope || envelope.v !== 1) throw new Error('unknown envelope');
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
      const aesKey = await crypto.subtle.importKey('raw', sharedBits, { name: 'AES-GCM' }, false, ['decrypt']);
      const iv = this.b64ToBytes(envelope.iv);
      const ct = this.b64ToBytes(envelope.ct);
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct));
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
