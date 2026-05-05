/* Check-in / PIN entry wireframes -- 3 directions */

const PinKeypad = ({ accent, dark }) => {
  const keys = ['1','2','3','4','5','6','7','8','9','','0','del'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {keys.map(function(k, i) {
        if (k === '') return <div key={i}></div>;
        return (
          <Box key={i} variant="wobble-sm" style={{
            padding: '14px 0', textAlign: 'center', fontSize: 22,
            fontFamily: 'var(--mono)',
            borderColor: accent || 'currentColor',
          }}>{k}</Box>
        );
      })}
    </div>
  );
};

const CheckInA = () => (
  <Frame dark>
    <NavBar active="dashboard" />
    <div style={{ maxWidth: 360, margin: '20px auto 0', textAlign: 'center' }}>
      <div className="t-mono t-soft" style={{ fontSize: 11, letterSpacing: '0.2em' }}>CHECK IN - DEFUSE PIN</div>
      <div className="h-hand" style={{ fontSize: 32, marginTop: 8 }}>I'm here.</div>
      <div className="t-soft" style={{ fontSize: 13, marginTop: 4 }}>
        Enter your PIN to reset the timer to <span className="t-mono">14d 00h</span>.
      </div>

      {/* PIN dots */}
      <div className="row center" style={{ gap: 10, marginTop: 22 }}>
        {[1,2,3,4,5,6].map(function(i) {
          return (
            <div key={i} style={{
              width: 22, height: 22, borderRadius: '50%',
              border: '2px solid currentColor',
              background: i <= 3 ? 'currentColor' : 'transparent'
            }}></div>
          );
        })}
      </div>

      <div style={{ marginTop: 22 }}>
        <PinKeypad />
      </div>

      <Annot style={{ right: -120, top: 220, transform: 'rotate(4deg)', width: 110, color: 'var(--accent)' }}>
        ^ duress PIN works<br/>here too -- silent
      </Annot>

      <Box variant="wobble-sm" style={{ padding: '8px 14px', marginTop: 18, display: 'inline-block', fontSize: 13 }}>
        use passkey instead
      </Box>
    </div>
  </Frame>
);

const CheckInB = () => (
  <Frame>
    <NavBar active="dashboard" />
    <div style={{ maxWidth: 420, margin: '40px auto 0' }}>
      <Stamp kind="stamp-info">heartbeat</Stamp>
      <div className="h-hand" style={{ fontSize: 44, marginTop: 8 }}>still here.</div>
      <Underline width={140} />
      <p style={{ fontSize: 14, marginTop: 14, lineHeight: 1.5 }}>
        Type your <strong>defuse PIN</strong> below. The timer will reset and a new server-side key share will be issued.
      </p>

      {/* Per-digit boxes */}
      <div className="row" style={{ gap: 8, marginTop: 18 }}>
        {[7, 2, 4, '_', '_', '_'].map(function(d, i) {
          return (
            <Box key={i} variant="wobble-sm" style={{
              flex: 1, textAlign: 'center', padding: '14px 0',
              fontFamily: 'var(--mono)', fontSize: 26,
              color: d === '_' ? 'var(--ink-faint)' : 'inherit'
            }}>{d}</Box>
          );
        })}
      </div>

      <div className="t-mono t-faint" style={{ fontSize: 11, marginTop: 10 }}>
        wrong PINs != released; 5 wrong attempts in 1h locks check-in for support recovery.
      </div>

      <Hr />

      <Box variant="wobble" style={{ padding: 14 }}>
        <div className="row between">
          <div className="t-mono t-soft" style={{ fontSize: 11 }}>// after this check-in</div>
        </div>
        <div className="t-mono" style={{ fontSize: 12, lineHeight: 1.7, marginTop: 6 }}>
          <div>-> timer resets to 14d 00h</div>
          <div>-> server share rotates (old share invalidated)</div>
          <div>-> public log: <span className="t-faint">defuse#...</span> appended</div>
        </div>
      </Box>

      <div className="row between" style={{ marginTop: 18 }}>
        <Box variant="wobble-sm" style={{ padding: '8px 16px' }}>cancel</Box>
        <Box variant="wobble-sm" className="btn-primary" style={{ padding: '8px 16px' }}>defuse -></Box>
      </div>
    </div>
  </Frame>
);

const CheckInC = () => (
  <Frame>
    <NavBar active="dashboard" />
    <div className="row" style={{ gap: 24, marginTop: 12, alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <div className="h-hand" style={{ fontSize: 36 }}>check in</div>
        <Underline width={120} />
        <p style={{ fontSize: 14, marginTop: 8 }} className="t-soft">Two PINs. Same input. Only the effect changes.</p>

        <Box variant="wobble" style={{ padding: 20, marginTop: 14 }}>
          <div className="row" style={{ gap: 8, marginBottom: 14, justifyContent: 'center' }}>
            {[1,2,3,4,5,6].map(function(i) {
              return (
                <div key={i} style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: '2px solid var(--ink)',
                  background: i <= 4 ? 'var(--ink)' : 'transparent'
                }}></div>
              );
            })}
          </div>
          <PinKeypad />
        </Box>
      </div>

      <div style={{ flex: 1 }}>
        <Stamp kind="stamp-ink">two paths</Stamp>
        <div className="col" style={{ gap: 12, marginTop: 12 }}>
          <Box variant="wobble" style={{ padding: 14, borderColor: 'var(--accent-2)' }}>
            <div className="h-hand" style={{ fontSize: 22, color: 'var(--accent-2)' }}>defuse PIN</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>resets the timer. logs a defuse event. recipient never knows you almost lapsed.</div>
          </Box>
          <Box variant="wobble" style={{ padding: 14, borderColor: 'var(--accent)' }}>
            <div className="h-hand" style={{ fontSize: 22, color: 'var(--accent)' }}>duress PIN</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>looks identical to defuse on screen. immediately releases payload to recipient AND purges the blob from R2.</div>
            <div className="t-mono t-faint" style={{ fontSize: 11, marginTop: 6 }}>(coercer-safe: no visual difference)</div>
          </Box>
          <Box variant="wobble" style={{ padding: 12 }}>
            <div className="t-mono t-soft" style={{ fontSize: 11 }}>POST-RELEASE</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>public log keeps the event hash forever. duress wipes the payload, not the history.</div>
          </Box>
        </div>
      </div>
    </div>
  </Frame>
);

window.CheckInA = CheckInA;
window.CheckInB = CheckInB;
window.CheckInC = CheckInC;
