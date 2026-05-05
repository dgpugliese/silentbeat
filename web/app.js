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

    // Client-side AES-GCM. Generates a random 32-byte K, returns ciphertext+iv blob and K.
    // Phase 6: split K into shareA + ECIES(shareB, recipientPubkey) before sending.
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
