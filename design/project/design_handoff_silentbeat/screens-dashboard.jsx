/* Dashboard wireframes -- 3 directions */

const DashboardA = () => (
  <Frame dark>
    <NavBar active="dashboard" />
    <div className="row between" style={{ alignItems: 'baseline' }}>
      <div>
        <div className="h-hand" style={{ fontSize: 28 }}>your switch is armed.</div>
        <div className="t-soft" style={{ fontSize: 14, marginTop: 2 }}>last heartbeat 6 hours ago - recipient jane@...</div>
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <span className="blip"></span>
        <span className="t-mono" style={{ fontSize: 12 }}>ALIVE</span>
      </div>
    </div>

    <Box variant="wobble" style={{ padding: 32, marginTop: 18, textAlign: 'center' }}>
      <div className="t-mono t-soft" style={{ fontSize: 11, letterSpacing: '0.2em' }}>TIME UNTIL RELEASE</div>
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
        <CountdownDigits d="13" h="17" m="42" s="08" size="xl" />
      </div>
      <div className="t-soft" style={{ fontSize: 13, marginTop: 14 }}>expires May 19, 2026 - 03:14 UTC</div>
      <div className="row center" style={{ gap: 12, marginTop: 22 }}>
        <Box variant="wobble-sm" className="btn-primary" style={{ padding: '10px 22px', fontSize: 16 }}>check in -></Box>
        <Box variant="wobble-sm" style={{ padding: '10px 22px', fontSize: 16 }}>edit switch</Box>
      </div>
    </Box>

    <div className="row" style={{ gap: 12, marginTop: 14 }}>
      <Box variant="wobble" style={{ padding: 12, flex: 1 }}>
        <div className="t-mono t-soft" style={{ fontSize: 11 }}>RECENT</div>
        <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }} className="t-mono">
          <div>06:02 -- heartbeat ok</div>
          <div>00:14 -- heartbeat ok</div>
          <div className="t-soft">−1d  -- heartbeat ok</div>
          <div className="t-soft">−2d  -- heartbeat ok</div>
        </div>
      </Box>
      <Box variant="wobble" style={{ padding: 12, flex: 1 }}>
        <div className="t-mono t-soft" style={{ fontSize: 11 }}>SAFETY NETS</div>
        <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
          <div>ok daily reminder email</div>
          <div>ok passkey enrolled</div>
          <div>ok recovery contact set</div>
        </div>
      </Box>
      <Box variant="wobble" style={{ padding: 12, flex: 1 }}>
        <div className="t-mono t-soft" style={{ fontSize: 11 }}>DANGER ZONE</div>
        <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <Box variant="wobble-sm" style={{ padding: '4px 10px', fontSize: 12 }}>disarm</Box>
          <Box variant="wobble-sm" style={{ padding: '4px 10px', fontSize: 12 }}>destroy payload</Box>
        </div>
      </Box>
    </div>
  </Frame>
);

const DashboardB = () => (
  <Frame>
    <NavBar active="dashboard" />
    <div className="row between" style={{ alignItems: 'baseline' }}>
      <div className="h-hand" style={{ fontSize: 30 }}>your switches</div>
      <Box variant="wobble-sm" className="btn-primary" style={{ padding: '6px 14px', fontSize: 14 }}>+ new switch</Box>
    </div>
    <Underline width={140} />

    {/* List of switches */}
    <div className="col" style={{ gap: 12, marginTop: 16 }}>
      {[
        { name: 'source-protection', recip: 'editor@...', d: '13d 17h', status: 'alive', color: 'var(--accent-2)' },
        { name: 'estate', recip: 'lawyer@...', d: '89d 02h', status: 'alive', color: 'var(--accent-2)' },
        { name: 'travel-insurance', recip: 'mom@...', d: '02h 14m', status: 'urgent', color: 'var(--accent)' },
        { name: 'old-job-files', recip: 'colleague@...', d: '--', status: 'disarmed', color: 'var(--ink-faint)' }
      ].map(function(s) {
        return (
          <Box key={s.name} variant="wobble" style={{ padding: 14 }}>
            <div className="row between" style={{ alignItems: 'center' }}>
              <div className="row" style={{ gap: 14, alignItems: 'center' }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                  background: s.color
                }}></span>
                <div>
                  <div className="h-hand" style={{ fontSize: 22 }}>{s.name}</div>
                  <div className="t-mono t-faint" style={{ fontSize: 11 }}>-> {s.recip} - {s.status}</div>
                </div>
              </div>
              <div className="row" style={{ gap: 18, alignItems: 'center' }}>
                <div className="t-mono" style={{ fontSize: 22, color: s.color }}>{s.d}</div>
                <Box variant="wobble-sm" style={{ padding: '4px 12px', fontSize: 13 }}>check in</Box>
              </div>
            </div>
          </Box>
        );
      })}
    </div>

    <Annot style={{ right: 18, top: 270, transform: 'rotate(-3deg)', width: 130 }}>
      ^ urgent state goes red &lt; 24h
    </Annot>
  </Frame>
);

const DashboardC = () => (
  <Frame>
    <NavBar active="dashboard" />
    {/* Visual heartbeat-led dashboard */}
    <div style={{ textAlign: 'center', marginTop: 8 }}>
      <div className="t-mono t-faint" style={{ fontSize: 11, letterSpacing: '0.2em' }}>SWITCH - SOURCE-PROTECTION</div>
    </div>

    <div className="row" style={{ gap: 24, marginTop: 14, alignItems: 'center' }}>
      {/* Heartbeat trace */}
      <Box variant="wobble" style={{ padding: 14, flex: 1.4 }}>
        <div className="t-mono t-soft" style={{ fontSize: 11, marginBottom: 8 }}>// heartbeat -- last 14 days</div>
        <svg width="100%" height="120" viewBox="0 0 400 120" preserveAspectRatio="none">
          <path
            d="M0 60 L50 60 L60 30 L70 90 L80 60 L130 60 L140 25 L150 95 L160 60 L210 60 L220 28 L230 92 L240 60 L290 60 L300 35 L310 88 L320 60 L370 60 L380 22 L390 90 L400 60"
            stroke="var(--ink)" strokeWidth="2" fill="none" strokeLinejoin="round"
          />
        </svg>
        <div className="row between" style={{ marginTop: 6 }}>
          <span className="t-mono t-faint" style={{ fontSize: 10 }}>14d ago</span>
          <span className="t-mono t-faint" style={{ fontSize: 10 }}>now</span>
        </div>
      </Box>

      {/* Big countdown */}
      <Box variant="wobble" style={{ padding: 16, flex: 1, textAlign: 'center' }}>
        <div className="t-mono t-soft" style={{ fontSize: 11 }}>RELEASES IN</div>
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
          <CountdownDigits d="13" h="17" m="42" s="08" size="md" />
        </div>
        <Box variant="wobble-sm" className="btn-primary" style={{ padding: '8px 18px', fontSize: 15, marginTop: 14, display: 'inline-block' }}>I'm here -></Box>
      </Box>
    </div>

    {/* Lower row */}
    <div className="row" style={{ gap: 12, marginTop: 14 }}>
      <Box variant="wobble" style={{ padding: 12, flex: 1 }}>
        <div className="t-mono t-soft" style={{ fontSize: 11 }}>RECIPIENT</div>
        <div style={{ marginTop: 4, fontSize: 14 }}>jane@example.org</div>
        <div className="t-mono t-faint" style={{ fontSize: 11, marginTop: 2 }}>encrypted at rest</div>
      </Box>
      <Box variant="wobble" style={{ padding: 12, flex: 1 }}>
        <div className="t-mono t-soft" style={{ fontSize: 11 }}>PAYLOAD</div>
        <div style={{ marginTop: 4, fontSize: 14 }}>1 message - 2 files</div>
        <div className="t-mono t-faint" style={{ fontSize: 11, marginTop: 2 }}>sha256: 4a91...f02e</div>
      </Box>
      <Box variant="wobble" style={{ padding: 12, flex: 1 }}>
        <div className="t-mono t-soft" style={{ fontSize: 11 }}>NEXT REMINDER</div>
        <div style={{ marginTop: 4, fontSize: 14 }}>tomorrow 09:00</div>
        <div className="t-mono t-faint" style={{ fontSize: 11, marginTop: 2 }}>email - push</div>
      </Box>
    </div>
  </Frame>
);

window.DashboardA = DashboardA;
window.DashboardB = DashboardB;
window.DashboardC = DashboardC;
