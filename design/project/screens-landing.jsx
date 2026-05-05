/* Landing page wireframes -- 3 directions */

const LandingA = () => (
  <Frame>
    {/* Top nav */}
    <div className="row between" style={{ alignItems: 'center', marginBottom: 28 }}>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <span className="h-hand" style={{ fontSize: 26 }}>silentbeat</span>
        <span className="blip"></span>
      </div>
      <div className="row" style={{ gap: 18, fontSize: 14 }}>
        <span>how it works</span>
        <span>trust model</span>
        <span>public log</span>
        <Box variant="wobble-sm" style={{ padding: '6px 14px' }}>sign in</Box>
      </div>
    </div>

    {/* Hero */}
    <div style={{ maxWidth: 720, margin: '40px auto 0', textAlign: 'center', position: 'relative' }}>
      <div className="h-hand" style={{ fontSize: 72, lineHeight: 0.95 }}>
        If you go silent,<br />
        someone gets the<br /> message.
      </div>
      <div style={{ display: 'inline-block', marginTop: 6 }}>
        <Underline width={300} />
      </div>
      <p style={{ fontSize: 18, marginTop: 24, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
        SilentBeat is a dead man's switch. You set a timer, an encrypted payload,
        and a recipient. If you don't check in before the timer ends, the
        payload is released. That's it.
      </p>
      <div className="row center" style={{ gap: 14, marginTop: 28 }}>
        <Box variant="wobble-sm" className="btn-primary" style={{ padding: '10px 22px', fontSize: 18 }}>create a switch -></Box>
        <Box variant="wobble-sm" style={{ padding: '10px 22px', fontSize: 18 }}>read trust model</Box>
      </div>
      <Annot style={{ top: 30, right: -20, transform: 'rotate(8deg)', fontSize: 16 }}>
        no marketing<br /> weasel-words
      </Annot>
    </div>

    <Hr />

    {/* Trust statement preview */}
    <div className="row" style={{ gap: 18, marginTop: 24, alignItems: 'flex-start' }}>
      <div className="grow">
        <div className="h-hand" style={{ fontSize: 28, marginBottom: 4 }}>What the server can do</div>
        <Underline width={180} color="var(--accent)" />
        <p style={{ fontSize: 14, marginTop: 10, lineHeight: 1.5 }}>
          Hold an encrypted blob. Hold half of the key. Release both to your recipient when your timer expires. <Sticker kind="sticker-warn">it cannot decrypt alone</Sticker>
        </p>
      </div>
      <div className="grow">
        <div className="h-hand" style={{ fontSize: 28, marginBottom: 4 }}>What it can't do</div>
        <Underline width={180} color="var(--accent-2)" />
        <p style={{ fontSize: 14, marginTop: 10, lineHeight: 1.5 }}>
          Decrypt your payload. Read your recipient's email in plaintext. Survive a Cloudflare-wide outage. Protect you from a recipient who can be coerced.
        </p>
      </div>
      <div className="grow">
        <div className="h-hand" style={{ fontSize: 28, marginBottom: 4 }}>What you trust us with</div>
        <Underline width={180} color="var(--accent-3)" />
        <p style={{ fontSize: 14, marginTop: 10, lineHeight: 1.5 }}>
          Running the timer honestly. Publishing every release in our public log. Telling you when we're compelled by court order, to the extent we legally can.
        </p>
      </div>
    </div>
  </Frame>
);

/* Direction B -- single column, blunt operator-style README feel */
const LandingB = () => (
  <Frame>
    <div style={{ maxWidth: 560, margin: '0 auto', position: 'relative' }}>
      <div className="row between" style={{ alignItems: 'center', marginBottom: 36 }}>
        <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
          <span className="h-hand" style={{ fontSize: 24 }}>silentbeat</span>
          <span className="blip"></span>
        </div>
        <span className="t-mono t-faint" style={{ fontSize: 11 }}>v0 - public alpha</span>
      </div>

      <Stamp kind="stamp-ink">README -- read first</Stamp>
      <div className="h-hand" style={{ fontSize: 56, lineHeight: 1, marginTop: 14 }}>
        A dead man's switch<br />
        that tells you the truth<br />
        about what it is.
      </div>

      <Hr />

      <div className="t-mono" style={{ fontSize: 13, lineHeight: 1.7 }}>
        <div><span className="t-faint">01.</span> You write a payload. SilentBeat encrypts it in your browser.</div>
        <div><span className="t-faint">02.</span> The key is split. Half lives on our server. Half lives in your head (a PIN).</div>
        <div><span className="t-faint">03.</span> You check in before the timer runs out. We reset.</div>
        <div><span className="t-faint">04.</span> You don't. We mail your recipient our half + a link with the other half.</div>
        <div><span className="t-faint">05.</span> Every release, defuse, and creation is logged publicly. Verifiable.</div>
      </div>

      <Hr />

      <div className="h-hand" style={{ fontSize: 24, marginTop: 4 }}>This is not zero-knowledge.</div>
      <p style={{ fontSize: 15, marginTop: 6, lineHeight: 1.55 }}>
        A switch that releases when you're gone <em>cannot</em> be zero-knowledge.
        Someone has to push the button on your behalf. We're upfront about it.
      </p>

      <div className="row" style={{ gap: 12, marginTop: 24 }}>
        <Box variant="wobble-sm" className="btn-primary" style={{ padding: '10px 22px', fontSize: 17 }}>start -></Box>
        <Box variant="wobble-sm" style={{ padding: '10px 22px', fontSize: 17 }}>full threat model</Box>
      </div>

      <Annot style={{ right: -150, top: 180, transform: 'rotate(-4deg)', width: 130 }}>
        ^ blunt, not sales-y
      </Annot>
    </div>
  </Frame>
);

/* Direction C -- operator log + diagram */
const LandingC = () => (
  <Frame dark>
    <div className="row between" style={{ alignItems: 'center', marginBottom: 24 }}>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
        <span className="h-hand" style={{ fontSize: 24 }}>silentbeat</span>
        <span className="blip"></span>
      </div>
      <div className="row" style={{ gap: 16, fontSize: 13 }}>
        <span className="t-soft">trust</span>
        <span className="t-soft">log</span>
        <span className="t-soft">docs</span>
        <Box variant="wobble-sm" style={{ padding: '4px 12px' }}>sign in</Box>
      </div>
    </div>

    <div className="row" style={{ gap: 24, alignItems: 'flex-start', marginTop: 18 }}>
      <div style={{ flex: 1.1 }}>
        <div className="h-hand" style={{ fontSize: 60, lineHeight: 0.98 }}>
          A switch that<br/>
          fires when<br/>
          you don't.
        </div>
        <p style={{ fontSize: 16, marginTop: 18, lineHeight: 1.5 }} className="t-soft">
          Encrypted payload. Recipient. Timer. If you stop checking in,
          your message goes out -- and the world sees it happened.
        </p>
        <div className="row" style={{ gap: 12, marginTop: 22 }}>
          <Box variant="wobble-sm" className="btn-primary" style={{ padding: '10px 22px' }}>create switch</Box>
          <Box variant="wobble-sm" style={{ padding: '10px 22px' }}>see public log</Box>
        </div>
      </div>

      {/* Diagram */}
      <div style={{ flex: 1 }}>
        <Box variant="wobble" style={{ padding: 16 }}>
          <div className="t-mono t-faint" style={{ fontSize: 11, marginBottom: 10 }}>// architecture</div>
          <div className="col" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Box variant="wobble-sm" style={{ padding: '6px 10px', fontSize: 13 }}>you (browser)</Box>
              <SketchArrow length={40} color="#e8e6df" />
              <span className="t-mono" style={{ fontSize: 11 }}>encrypts</span>
            </div>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Box variant="wobble-sm" style={{ padding: '6px 10px', fontSize: 13 }}>silentbeat server</Box>
              <span className="t-mono t-faint" style={{ fontSize: 11 }}>holds blob + 1/2 key</span>
            </div>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Box variant="wobble-sm" style={{ padding: '6px 10px', fontSize: 13 }}>your head</Box>
              <span className="t-mono t-faint" style={{ fontSize: 11 }}>holds the other 1/2 (PIN)</span>
            </div>
            <Hr />
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Box variant="wobble-sm" style={{ padding: '6px 10px', fontSize: 13 }}>timer = 0</Box>
              <SketchArrow length={40} color="#e8e6df" />
              <Box variant="wobble-sm" style={{ padding: '6px 10px', fontSize: 13 }}>recipient gets both</Box>
            </div>
          </div>
        </Box>
        <div style={{ marginTop: 14, fontSize: 13 }} className="t-soft">
          The server is never the only thing standing between your payload and its recipient. Even at release time.
        </div>
      </div>
    </div>

    <Hr />

    <div className="row" style={{ gap: 12, marginTop: 14 }}>
      <Stamp kind="stamp-info">honest about limits</Stamp>
      <Stamp kind="stamp-ok">public audit log</Stamp>
      <Stamp>open threat model</Stamp>
      <Stamp kind="stamp-ink">no passwords</Stamp>
    </div>
  </Frame>
);

window.LandingA = LandingA;
window.LandingB = LandingB;
window.LandingC = LandingC;
