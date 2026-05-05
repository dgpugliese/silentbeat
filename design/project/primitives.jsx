/* Shared sketchy primitives for SilentBeat wireframes */

const Hatch = ({ children, style }) => (
  <div className="hatch" style={style}>{children}</div>
);

const Box = ({ children, style, variant, className }) => (
  <div className={`${variant || 'wobble'} ${className || ''}`} style={style}>{children}</div>
);

const Annot = ({ children, style }) => (
  <div className="annot" style={style}>{children}</div>
);

const ImgPh = ({ label, style, ratio }) => (
  <div className="img-ph" style={Object.assign({ aspectRatio: ratio }, style)}>{label}</div>
);

const Stamp = ({ children, kind, style }) => (
  <span className={`stamp ${kind || ''}`} style={style}>{children}</span>
);

const Sticker = ({ children, kind, style }) => (
  <span className={`sticker ${kind || ''}`} style={style}>{children}</span>
);

const Hr = () => <hr className="hr-sketch" />;

const Underline = ({ width, color }) => {
  const w = width || 200;
  const c = color || 'currentColor';
  return (
    <svg width={w} height="10" viewBox={`0 0 ${w} 10`} style={{ display: 'block' }}>
      <path d={`M2 6 Q ${w * 0.25} 1, ${w * 0.5} 5 T ${w - 2} 4`} stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
};

const SketchArrow = ({ direction, length, color }) => {
  const dir = direction || 'right';
  const len = length || 60;
  const c = color || 'currentColor';
  const w = dir === 'right' || dir === 'left' ? len : 24;
  const h = dir === 'right' || dir === 'left' ? 24 : len;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      {dir === 'right' && (
        <g>
          <path d={`M2 ${h/2} Q ${w/2} ${h/2 - 3}, ${w-6} ${h/2}`} stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d={`M${w-12} ${h/2 - 6} L${w-2} ${h/2} L${w-12} ${h/2 + 6}`} stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {dir === 'down' && (
        <g>
          <path d={`M${w/2} 2 Q ${w/2 + 3} ${h/2}, ${w/2} ${h-6}`} stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d={`M${w/2 - 6} ${h-12} L${w/2} ${h-2} L${w/2 + 6} ${h-12}`} stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
};

const Frame = ({ children, dark, style, className }) => (
  <div className={`frame ${dark ? 'frame-dark' : ''} ${className || ''}`} style={Object.assign({ width: '100%', height: '100%' }, style)}>
    {children}
  </div>
);

const NavBar = ({ active }) => (
  <div className="row between" style={{ alignItems: 'center', marginBottom: 14 }}>
    <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
      <span className="h-hand" style={{ fontSize: 22 }}>silentbeat</span>
      <span className="blip" style={{ marginLeft: 4 }}></span>
    </div>
    <div className="row" style={{ gap: 14, fontSize: 14 }}>
      {['dashboard', 'log', 'settings'].map(function(item) {
        return (
          <span key={item} style={{
            textDecoration: item === active ? 'underline' : 'none',
            textDecorationStyle: 'wavy',
            textUnderlineOffset: 4,
            color: item === active ? 'inherit' : 'var(--ink-faint)'
          }}>{item}</span>
        );
      })}
    </div>
  </div>
);

const CountdownDigits = ({ d, h, m, s, size }) => {
  const sz = size || 'lg';
  const fontSize = sz === 'xl' ? 88 : sz === 'lg' ? 56 : 32;
  const labelSize = sz === 'xl' ? 14 : 12;
  const cell = (val, label) => (
    <div style={{ textAlign: 'center' }}>
      <div className="t-mono" style={{ fontSize: fontSize, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.04em' }}>{val}</div>
      <div className="t-mono t-faint" style={{ fontSize: labelSize, marginTop: 4, textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
  return (
    <div className="row" style={{ gap: sz === 'xl' ? 28 : 18, alignItems: 'flex-end' }}>
      {cell(d, 'days')}
      <div className="t-mono t-faint" style={{ fontSize: fontSize * 0.6, lineHeight: 1 }}>:</div>
      {cell(h, 'hrs')}
      <div className="t-mono t-faint" style={{ fontSize: fontSize * 0.6, lineHeight: 1 }}>:</div>
      {cell(m, 'min')}
      <div className="t-mono t-faint" style={{ fontSize: fontSize * 0.6, lineHeight: 1 }}>:</div>
      {cell(s, 'sec')}
    </div>
  );
};

Object.assign(window, {
  Hatch: Hatch, Box: Box, Annot: Annot, ImgPh: ImgPh, Stamp: Stamp, Sticker: Sticker, Hr: Hr,
  Underline: Underline, SketchArrow: SketchArrow, Frame: Frame, NavBar: NavBar, CountdownDigits: CountdownDigits
});
