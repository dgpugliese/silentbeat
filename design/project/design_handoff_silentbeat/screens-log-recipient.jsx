/* Transparency log + recipient release wireframes */

const LogA = () => (
  <Frame dark>
    <NavBar active="log" />
    <div className="row between" style={{ alignItems: 'baseline' }}>
      <div>
        <div className="h-hand" style={{ fontSize: 32 }}>public log</div>
        <div className="t-soft" style={{ fontSize: 13 }}>append-only - merkle-rooted - refreshes every 60s</div>
      </div>
      <div className="row" style={{ gap: 8, fontSize: 12 }}>
        <Box variant="wobble-sm" style={{ padding: '4px 10px' }}>verify root ^</Box>
        <Box variant="wobble-sm" style={{ padding: '4px 10px' }}>download CSV</Box>
      </div>
    </div>
    <Underline width={120} color="#e8e6df" />

    <Box variant="wobble" style={{ padding: 12, marginTop: 14 }}>
      <div className="t-mono" style={{ fontSize: 12, lineHeight: 1.85 }}>
        {[
          ['2026-05-05 14:02:11Z', 'release ', 'sw#a3f9c2...', 'cron-sweep'],
          ['2026-05-05 13:58:04Z', 'defuse  ', 'sw#7e21b8...', 'user'],
          ['2026-05-05 13:42:30Z', 'create  ', 'sw#9c01ee...', 'user'],
          ['2026-05-05 12:18:55Z', 'defuse  ', 'sw#a3f9c2...', 'user'],
          ['2026-05-05 11:04:09Z', 'duress  ', 'sw#0d44a1...', 'user (purged)'],
          ['2026-05-05 09:30:00Z', 'create  ', 'sw#5b8377...', 'user'],
          ['2026-05-04 22:11:42Z', 'release ', 'sw#22c190...', 'cron-sweep'],
        ].map(function(row, i) {
          return (
            <div key={i} className="row" style={{ gap: 16 }}>
              <span className="t-faint">{row[0]}</span>
              <span style={{ width: 70, color: row[1].includes('release') ? 'var(--accent)' : row[1].includes('duress') ? 'var(--accent)' : row[1].includes('defuse') ? 'var(--accent-2)' : 'var(--accent-3)' }}>{row[1]}</span>
              <span>{row[2]}</span>
              <span className="t-faint">{row[3]}</span>
            </div>
          );
        })}
        <div className="t-faint" style={{ marginTop: 6 }}>... 14,221 more entries</div>
      </div>
    </Box>

    <div className="row between" style={{ marginTop: 12, fontSize: 12 }} >
      <span className="t-soft t-mono">root: 4a91b0c2...0e7f - signed by silentbeat-prod</span>
      <span className="t-soft">we cannot delete entries. only append.</span>
    </div>
  </Frame>
);

const LogB = () => (
  <Frame>
    <NavBar active="log" />
    <div className="row between" style={{ alignItems: 'baseline' }}>
      <div className="h-hand" style={{ fontSize: 30 }}>public log</div>
      <div className="row" style={{ gap: 8, fontSize: 12 }}>
        {['all', 'create', 'defuse', 'release', 'duress'].map(function(f, i) {
          return <Box key={f} variant="wobble-sm" style={{ padding: '4px 10px', background: i === 0 ? 'var(--ink)' : 'transparent', color: i === 0 ? 'var(--paper)' : 'inherit' }}>{f}</Box>;
        })}
      </div>
    </div>
    <Underline width={120} />

    {/* Stat strip */}
    <div className="row" style={{ gap: 12, marginTop: 14 }}>
      {[
        ['14,221', 'total events'],
        ['8,902', 'switches alive'],
        ['41', 'released this month'],
        ['3', 'duress this month']
      ].map(function(s, i) {
        return (
          <Box key={i} variant="wobble" style={{ padding: 10, flex: 1 }}>
            <div className="h-hand" style={{ fontSize: 26 }}>{s[0]}</div>
            <div className="t-mono t-faint" style={{ fontSize: 11 }}>{s[1]}</div>
          </Box>
        );
      })}
    </div>

    <Box variant="wobble" style={{ padding: 12, marginTop: 14 }}>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
        <thead>
          <tr style={{ textAlign: 'left' }} className="t-faint">
            <th style={{ padding: '4px 8px', fontWeight: 400 }}>time</th>
            <th style={{ padding: '4px 8px', fontWeight: 400 }}>event</th>
            <th style={{ padding: '4px 8px', fontWeight: 400 }}>switch hash</th>
            <th style={{ padding: '4px 8px', fontWeight: 400 }}>actor</th>
            <th style={{ padding: '4px 8px', fontWeight: 400 }}>seq</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['14:02:11', 'release', 'a3f9c2...', 'cron', '14221'],
            ['13:58:04', 'defuse',  '7e21b8...', 'user', '14220'],
            ['13:42:30', 'create',  '9c01ee...', 'user', '14219'],
            ['12:18:55', 'defuse',  'a3f9c2...', 'user', '14218'],
            ['11:04:09', 'duress',  '0d44a1...', 'user', '14217'],
          ].map(function(r, i) {
            return (
              <tr key={i} style={{ borderTop: '1px dashed var(--ink-faint)' }}>
                {r.map(function(c, j) { return <td key={j} style={{ padding: '6px 8px' }}>{c}</td>; })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Box>
  </Frame>
);

const LogC = () => (
  <Frame>
    <NavBar active="log" />
    <div className="h-hand" style={{ fontSize: 30 }}>live feed</div>
    <Underline width={120} color="var(--accent)" />
    <div className="t-soft" style={{ fontSize: 13 }}>last 5 minutes - scroll for history</div>

    <Box variant="wobble" style={{ padding: 0, marginTop: 14, overflow: 'hidden' }}>
      {[
        { t: '6s ago', kind: 'create', color: 'var(--accent-3)', hash: 'sw#5b8377...' },
        { t: '24s ago', kind: 'defuse', color: 'var(--accent-2)', hash: 'sw#a3f9c2...' },
        { t: '1m ago', kind: 'release', color: 'var(--accent)', hash: 'sw#22c190...', meta: 'timer expired - recipient notified' },
        { t: '2m ago', kind: 'create', color: 'var(--accent-3)', hash: 'sw#9c01ee...' },
        { t: '4m ago', kind: 'duress', color: 'var(--accent)', hash: 'sw#0d44a1...', meta: 'payload purged' }
      ].map(function(e, i) {
        return (
          <div key={i} style={{ padding: '12px 14px', borderTop: i ? '1px dashed var(--ink-faint)' : 'none' }} className="row between">
            <div className="row" style={{ gap: 14, alignItems: 'center' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: e.color, display: 'inline-block' }}></span>
              <div>
                <div style={{ fontSize: 14 }}><strong>{e.kind}</strong> <span className="t-mono t-faint">{e.hash}</span></div>
                {e.meta && <div className="t-faint" style={{ fontSize: 12 }}>{e.meta}</div>}
              </div>
            </div>
            <span className="t-mono t-faint" style={{ fontSize: 11 }}>{e.t}</span>
          </div>
        );
      })}
    </Box>
    <div className="t-mono t-faint" style={{ fontSize: 11, marginTop: 10 }}>
      streaming via cloudflare durable object - merkle root updates every 1m
    </div>
  </Frame>
);

/* Recipient release flow -- what jane sees in her inbox + share-link landing */

const RecipientA = () => (
  <Frame>
    {/* Bare bones */}
    <div style={{ maxWidth: 460, margin: '40px auto 0', textAlign: 'center' }}>
      <div className="h-hand" style={{ fontSize: 24 }}>silentbeat</div>
      <Hr />
      <div className="h-hand" style={{ fontSize: 30, marginTop: 18 }}>a message was released to you.</div>
      <div className="t-soft" style={{ fontSize: 14, marginTop: 6 }}>from: sam@...  -  expired May 5, 2026</div>

      <Box variant="wobble" style={{ padding: 18, marginTop: 22, textAlign: 'left' }}>
        <div className="t-mono t-soft" style={{ fontSize: 11 }}>// to decrypt, paste the link from the email</div>
        <div className="field t-mono" style={{ marginTop: 8 }}>https://silentbeat.app/r/9c01ee...#share=...</div>
        <Box variant="wobble-sm" className="btn-primary" style={{ padding: '8px 16px', marginTop: 12, display: 'inline-block' }}>decrypt -></Box>
      </Box>
      <div className="t-mono t-faint" style={{ fontSize: 11, marginTop: 12 }}>everything happens in your browser. nothing is logged on our server about you reading this.</div>
    </div>
  </Frame>
);

const RecipientB = () => (
  <Frame>
    <div style={{ maxWidth: 540, margin: '20px auto 0' }}>
      <div className="row between">
        <div className="h-hand" style={{ fontSize: 22 }}>silentbeat</div>
        <span className="t-mono t-faint" style={{ fontSize: 11 }}>release - sw#9c01ee...</span>
      </div>
      <Hr />

      <Stamp kind="stamp-ink">read carefully</Stamp>
      <div className="h-hand" style={{ fontSize: 32, marginTop: 8 }}>Sam asked us to send this if they went silent.</div>
      <p style={{ fontSize: 14, marginTop: 10, lineHeight: 1.55 }}>
        Sam created a SilentBeat switch on <span className="t-mono">2025-12-14</span>.
        They named you as the recipient. The timer ran out on{' '}
        <span className="t-mono">2026-05-05</span>{' '}
        -- meaning Sam didn't check in. SilentBeat is now releasing the payload they encrypted for you.
      </p>

      <Box variant="wobble" style={{ padding: 14, marginTop: 14 }}>
        <div className="t-mono t-soft" style={{ fontSize: 11 }}>// what to expect</div>
        <ol style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.6, marginTop: 6 }}>
          <li>SilentBeat sends you a server-held key share (this email).</li>
          <li>The link below carries the second share in its URL fragment.</li>
          <li>Open the link to combine both shares in your browser and decrypt.</li>
          <li>Save the contents. The link won't work twice on a fresh device.</li>
        </ol>
      </Box>

      <div className="row" style={{ gap: 10, marginTop: 16 }}>
        <Box variant="wobble-sm" className="btn-primary" style={{ padding: '10px 22px' }}>open release link -></Box>
        <Box variant="wobble-sm" style={{ padding: '10px 22px' }}>verify in public log</Box>
      </div>

      <div className="t-soft" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>
        If this seems wrong -- Sam is fine, they meant to defuse, this isn't intended for you -- please tell us. We can't undo a release, but we can help you understand what was sent and to whom.
      </div>
    </div>
  </Frame>
);

const RecipientC = () => (
  <Frame dark>
    <div style={{ maxWidth: 480, margin: '20px auto 0' }}>
      <div className="row between">
        <div className="h-hand" style={{ fontSize: 22 }}>silentbeat</div>
        <Stamp kind="stamp-info">step 1 of 2</Stamp>
      </div>
      <Hr />

      <div className="h-hand" style={{ fontSize: 28 }}>confirm it's you.</div>
      <p style={{ fontSize: 13, marginTop: 6 }} className="t-soft">
        Before we hand over the server key share, prove you control the inbox Sam picked.
      </p>

      <Box variant="wobble" style={{ padding: 14, marginTop: 14 }}>
        <div className="t-mono" style={{ fontSize: 12 }}>recipient: jane@example.org</div>
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          {[2,9,1,4,'_','_'].map(function(d, i) {
            return (
              <Box key={i} variant="wobble-sm" style={{
                flex: 1, textAlign: 'center', padding: '12px 0',
                fontFamily: 'var(--mono)', fontSize: 22,
                color: d === '_' ? 'var(--ink-faint)' : 'inherit'
              }}>{d}</Box>
            );
          })}
        </div>
        <div className="t-mono t-faint" style={{ fontSize: 11, marginTop: 8 }}>
          6-digit code we just emailed to jane@example.org
        </div>
      </Box>

      <div className="row" style={{ gap: 10, marginTop: 14 }}>
        <Box variant="wobble-sm" className="btn-primary" style={{ padding: '10px 22px' }}>verify -></Box>
        <Box variant="wobble-sm" style={{ padding: '10px 22px' }}>resend code</Box>
      </div>

      <Hr />
      <div className="t-soft" style={{ fontSize: 12, lineHeight: 1.5 }}>
        After you verify, you'll be taken to a browser-only decrypt page. We never see the combined key.
      </div>
    </div>
  </Frame>
);

window.LogA = LogA;
window.LogB = LogB;
window.LogC = LogC;
window.RecipientA = RecipientA;
window.RecipientB = RecipientB;
window.RecipientC = RecipientC;
