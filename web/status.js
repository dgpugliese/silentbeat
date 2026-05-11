(() => {
  const $ = (id) => document.getElementById(id);

  function setDot(el, state) {
    el.setAttribute('data-state', state);
  }

  function fmtAge(seconds) {
    if (seconds === null || seconds === undefined) return 'never';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function fmtUtc(ms) {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  }

  async function pingEdge() {
    const t0 = performance.now();
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      const elapsed = Math.round(performance.now() - t0);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDot($('edge-dot'), 'ok');
      $('edge-headline').textContent = `edge reachable · ${elapsed}ms`;
      $('edge-meta').textContent = fmtUtc(Date.now());
    } catch (e) {
      setDot($('edge-dot'), 'down');
      $('edge-headline').textContent = `edge unreachable · ${String(e.message || e)}`;
      $('edge-meta').textContent = fmtUtc(Date.now());
    }
  }

  async function loadPipeline() {
    try {
      const r = await fetch('/api/status/pipeline', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const p = await r.json();
      $('as-of').textContent = fmtUtc(p.as_of);

      setDot($('audit-dot'), p.audit_log.state);
      $('audit-detail').textContent =
        p.audit_log.seq > 0
          ? `latest entry ${fmtAge(p.audit_log.latest_entry_age_seconds)} · seq ${p.audit_log.seq}`
          : 'no entries yet';

      setDot($('sweeper-dot'), p.sweeper.state);
      $('sweeper-detail').textContent =
        p.sweeper.last_run_age_seconds !== null
          ? `last run ${fmtAge(p.sweeper.last_run_age_seconds)} · scheduled every 5m`
          : 'no run recorded yet';

      setDot($('email-dot'), p.email.state);
      const lastDispatch =
        p.email.last_dispatch_age_seconds !== null
          ? `last dispatch ${fmtAge(p.email.last_dispatch_age_seconds)}`
          : 'no dispatch on record';
      $('email-detail').textContent = p.email.configured
        ? `provider configured · ${lastDispatch}`
        : `provider not configured`;
    } catch (e) {
      ['audit', 'sweeper', 'email'].forEach((k) => {
        setDot($(`${k}-dot`), 'down');
        $(`${k}-detail`).textContent = `unavailable · ${String(e.message || e)}`;
      });
    }
  }

  async function loadIncidents() {
    let incidents = [];
    try {
      const r = await fetch('/incidents.json', { cache: 'no-store' });
      if (r.ok) incidents = await r.json();
    } catch {
      // treat as empty
    }

    const days = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      days.push({ date: d.toISOString().slice(0, 10), state: 'ok', incidents: [] });
    }

    for (const inc of incidents) {
      const dayIdx = days.findIndex((d) => d.date === (inc.date || '').slice(0, 10));
      if (dayIdx >= 0) {
        days[dayIdx].incidents.push(inc);
        const sev = inc.severity === 'outage' ? 'down' : 'degraded';
        if (sev === 'down' || days[dayIdx].state === 'ok') {
          days[dayIdx].state = sev;
        }
      }
    }

    const bars = $('uptime-bars');
    bars.innerHTML = '';
    for (const d of days) {
      const bar = document.createElement('span');
      bar.className = 'uptime-bar';
      bar.setAttribute('data-state', d.state);
      const label = d.incidents.length
        ? `${d.date} — ${d.incidents.map((i) => i.summary || i.severity).join('; ')}`
        : `${d.date} — operational`;
      bar.title = label;
      bars.appendChild(bar);
    }

    const okDays = days.filter((d) => d.state === 'ok').length;
    const pct = ((okDays / days.length) * 100).toFixed(3);
    $('uptime-pct').textContent = `${pct}% uptime`;

    const list = $('incidents-list');
    const empty = $('incidents-empty');
    $('incidents-count').textContent = `${incidents.length} total`;
    if (incidents.length === 0) {
      empty.textContent = 'No incidents recorded.';
      return;
    }
    empty.remove();
    const sorted = [...incidents].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    for (const inc of sorted) {
      const row = document.createElement('div');
      row.className = 'incident-row';
      row.innerHTML = `
        <div class="incident-date t-mono">${escapeHtml(inc.date || '')}</div>
        <div class="incident-body">
          <div class="incident-title">${escapeHtml(inc.summary || 'incident')}</div>
          <div class="incident-meta t-mono">${escapeHtml(inc.severity || 'degraded')}${inc.duration_minutes ? ` · ${inc.duration_minutes} min` : ''}</div>
        </div>
      `;
      list.appendChild(row);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  pingEdge();
  loadPipeline();
  loadIncidents();
  setInterval(pingEdge, 30000);
  setInterval(loadPipeline, 30000);
})();
