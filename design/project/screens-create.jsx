/* Switch creation + dashboard wireframes */

const CreateA = () => (
  <Frame>
    <NavBar active="dashboard" />
    <div className="row between" style={{ alignItems: 'baseline' }}>
      <div className="h-hand" style={{ fontSize: 36 }}>new switch</div>
      <span className="t-mono t-faint" style={{ fontSize: 12 }}>step 2 of 5</span>
    </div>
    <Underline width={140} />

    {/* Stepper */}
    <div className="row" style={{ gap: 6, marginTop: 14, marginBottom: 18 }}>
      {['payload', 'recipient', 'timer', 'pins', 'review'].map(function(s, i) {
        return (
          <div key={s} className="row" style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Box variant="wobble-sm" style={{
              padding: '4px 10px', fontSize: 12,
              background: i <= 1 ? 'var(--ink)' : 'transparent',
              color: i <= 1 ? 'var(--paper)' : 'inherit',
            }}>{s}</Box>
            {i < 4 && <div style={{ flex: 1, borderTop: '2px dashed var(--ink-faint)' }} />}
          </div>
        );
      })}
    </div>

    <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
      <div className="grow col" style={{ gap: 12 }}>
        <Box variant="wobble" style={{ padding: 14 }}>
          <div className="t-mono t-faint" style={{ fontSize: 11, marginBottom: 6 }}>// payload</div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>What should we deliver?</div>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <Box variant="wobble-sm" style={{ padding: '4px 10px', fontSize: 12, background: 'var(--ink)', color: 'var(--paper)' }}>text message</Box>
            <Box variant="wobble-sm" style={{ padding: '4px 10px', fontSize: 12 }}>file (max 25mb)</Box>
            <Box variant="wobble-sm" style={{ padding: '4px 10px', fontSize: 12 }}>both</Box>
          </div>
          <div className="dashed" style={{ padding: 14, minHeight: 110, fontSize: 13, color: 'var(--ink-faint)' }}>
            "If you're reading this, I've gone silent for 14 days. Look in the safe deposit box at..."
          </div>
          <div className="t-mono t-faint" style={{ fontSize: 11, marginTop: 8 }}>^ encrypted in your browser before it leaves</div>
        </Box>

        <Box variant="wobble" style={{ padding: 14 }}>
          <div className="t-mono t-faint" style={{ fontSize: 11, marginBottom: 6 }}>// recipient</div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Who receives it?</div>
          <div className="field" style={{ marginBottom: 8 }}>jane@example.org</div>
          <div className="t-mono t-faint" style={{ fontSize: 11 }}>encrypted at rest. only decrypted at release time.</div>
        </Box>
      </div>

      <div style={{ width: 280 }} className="col">
        <Box variant="wobble" style={{ padding: 14 }}>
          <div className="h-hand" style={{ fontSize: 22 }}>preview</div>
          <Hr />
          <div className="t-mono" style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div>-> recipient: jane@...</div>
            <div>-> timer: 14 days</div>
            <div>-> defuse PIN: ******</div>
            <div>-> duress PIN: ******</div>
            <div>-> on expiry: email release</div>
          </div>
          <Hr />
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            You can edit any of this until you arm the switch.
          </div>
        </Box>
        <Sticker kind="sticker-warn">tip: pick a recipient who has email + can read a "click here to decrypt" link.</Sticker>
      </div>
    </div>

    <div className="row between" style={{ marginTop: 18 }}>
      <Box variant="wobble-sm" style={{ padding: '8px 16px' }}>back</Box>
      <Box variant="wobble-sm" className="btn-primary" style={{ padding: '8px 16px' }}>continue -></Box>
    </div>
  </Frame>
);

const CreateB = () => (
  <Frame>
    <NavBar active="dashboard" />
    <div className="h-hand" style={{ fontSize: 36 }}>arm a new switch</div>
    <Underline width={200} />
    <div style={{ fontSize: 14, marginTop: 6 }} className="t-soft">Single-page form. Edit any section, then review at the bottom.</div>

    {/* Two column form */}
    <div className="row" style={{ gap: 18, marginTop: 18, alignItems: 'flex-start' }}>
      <div className="col grow" style={{ gap: 12 }}>
        {/* Payload */}
        <Box variant="wobble" style={{ padding: 14 }}>
          <div className="row between">
            <div className="h-hand" style={{ fontSize: 22 }}>1. payload</div>
            <span className="t-mono t-faint" style={{ fontSize: 11 }}>encrypted client-side</span>
          </div>
          <div className="dashed" style={{ marginTop: 8, padding: 12, minHeight: 80, fontSize: 13, color: 'var(--ink-faint)' }}>
            paste a message, drop a file, or both
          </div>
        </Box>

        {/* Recipient */}
        <Box variant="wobble" style={{ padding: 14 }}>
          <div className="h-hand" style={{ fontSize: 22 }}>2. recipient</div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <div className="field grow">name (optional)</div>
            <div className="field grow">email</div>
          </div>
        </Box>

        {/* Timer */}
        <Box variant="wobble" style={{ padding: 14 }}>
          <div className="h-hand" style={{ fontSize: 22 }}>3. timer</div>
          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {['12h', '24h', '3d', '7d', '14d', '30d', 'custom'].map(function(t) {
              return (
                <Box key={t} variant="wobble-sm" style={{ padding: '4px 10px', fontSize: 12, background: t === '14d' ? 'var(--ink)' : 'transparent', color: t === '14d' ? 'var(--paper)' : 'inherit' }}>{t}</Box>
              );
            })}
          </div>
          <div className="row" style={{ gap: 12, marginTop: 12 }}>
            <div style={{ fontSize: 13 }}>check-in cadence:</div>
            <Box variant="wobble-sm" style={{ padding: '4px 10px', fontSize: 12 }}>daily reminder</Box>
            <Box variant="wobble-sm" style={{ padding: '4px 10px', fontSize: 12 }}>none</Box>
          </div>
        </Box>

        {/* PINs */}
        <Box variant="wobble" style={{ padding: 14 }}>
          <div className="h-hand" style={{ fontSize: 22 }}>4. pins</div>
          <div className="row" style={{ gap: 12, marginTop: 8 }}>
            <div className="grow">
              <div style={{ fontSize: 13, marginBottom: 4 }}>defuse PIN -- resets timer</div>
              <div className="field t-mono">* * * * * *</div>
            </div>
            <div className="grow">
              <div style={{ fontSize: 13, marginBottom: 4, color: 'var(--accent)' }}>duress PIN -- releases & purges</div>
              <div className="field t-mono" style={{ borderColor: 'var(--accent)' }}>* * * * * *</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12 }} className="t-soft">
            Same length, different effect. Only you should know which is which.
          </div>
        </Box>
      </div>

      <Box variant="wobble" style={{ padding: 16, width: 260, position: 'sticky', top: 18 }}>
        <div className="h-hand" style={{ fontSize: 24 }}>review</div>
        <Hr />
        <div className="t-mono" style={{ fontSize: 12, lineHeight: 1.7 }}>
          <div>payload -- <span className="t-faint">unset</span></div>
          <div>recipient -- <span className="t-faint">unset</span></div>
          <div>timer -- 14 days</div>
          <div>defuse -- <span className="t-faint">unset</span></div>
          <div>duress -- <span className="t-faint">unset</span></div>
        </div>
        <Hr />
        <Box variant="wobble-sm" className="btn-primary" style={{ padding: '8px 14px', textAlign: 'center', opacity: 0.4 }}>arm switch (4 to go)</Box>
        <div style={{ fontSize: 11, marginTop: 6 }} className="t-soft">Once armed, the timer starts immediately.</div>
      </Box>
    </div>
  </Frame>
);

const CreateC = () => (
  <Frame dark>
    <NavBar active="dashboard" />
    <div className="row between" style={{ alignItems: 'baseline' }}>
      <div className="h-hand" style={{ fontSize: 36 }}>compose</div>
      <span className="t-mono t-soft" style={{ fontSize: 12 }}>$ silentbeat new --interactive</span>
    </div>
    <Underline width={130} color="#e8e6df" />

    {/* Terminal-style layout */}
    <Box variant="wobble" style={{ padding: 16, marginTop: 16 }}>
      <div className="t-mono" style={{ fontSize: 13, lineHeight: 1.85 }}>
        <div><span className="t-faint">></span> payload type? <span style={{ borderBottom: '1px solid currentColor' }}>text+file</span></div>
        <div><span className="t-faint">></span> drop content here:</div>
        <div className="dashed" style={{ padding: 10, margin: '4px 0 8px', minHeight: 56 }}>
          <span className="t-soft">...paste or drag</span>
        </div>
        <div><span className="t-faint">></span> recipient email? <span style={{ borderBottom: '1px solid currentColor' }}>jane@example.org</span></div>
        <div><span className="t-faint">></span> timer? <span style={{ borderBottom: '1px solid currentColor' }}>14d</span> <span className="t-soft">(min 1h, max 1y)</span></div>
        <div><span className="t-faint">></span> defuse PIN? <span style={{ letterSpacing: '0.4em' }}>******</span></div>
        <div><span className="t-faint">></span> duress PIN? <span style={{ letterSpacing: '0.4em', color: 'var(--accent)' }}>******</span></div>
        <div><span className="t-faint">></span> on duress: <span style={{ borderBottom: '1px solid currentColor' }}>release + purge</span></div>
        <Hr />
        <div className="t-soft">-> ready to arm. server share will be generated and stored.</div>
        <div className="t-soft">-> public log entry will be written: <span className="t-mono">create#a3f9...</span></div>
      </div>
    </Box>

    <div className="row between" style={{ marginTop: 18, alignItems: 'center' }}>
      <span className="t-mono t-soft" style={{ fontSize: 12 }}>esc to cancel</span>
      <div className="row" style={{ gap: 10 }}>
        <Box variant="wobble-sm" style={{ padding: '8px 16px' }}>save draft</Box>
        <Box variant="wobble-sm" className="btn-primary" style={{ padding: '8px 16px' }}>arm switch enter</Box>
      </div>
    </div>
  </Frame>
);

window.CreateA = CreateA;
window.CreateB = CreateB;
window.CreateC = CreateC;
