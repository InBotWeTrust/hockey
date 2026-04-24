// Hand-drawn rink layer (SVG) rendered behind the Pixi canvas. Shares the
// RINK = 572×700 coordinate space with game-core, so preserveAspectRatio
// "xMidYMid meet" letter-boxes exactly the way PixiStage does — actors stay
// aligned with the painted lines regardless of viewport size.

export function RinkSvg(): JSX.Element {
  return (
    <svg
      viewBox="0 0 572 700"
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
      aria-hidden
    >
      <defs>
        <linearGradient id="rink-ice" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F4F8FC" />
          <stop offset="50%" stopColor="#EAF1F8" />
          <stop offset="100%" stopColor="#F4F8FC" />
        </linearGradient>
        <radialGradient id="rink-shine" cx="30%" cy="20%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <pattern
          id="rink-frost"
          x="0"
          y="0"
          width="120"
          height="120"
          patternUnits="userSpaceOnUse"
        >
          <rect width="120" height="120" fill="transparent" />
          <circle cx="20" cy="30" r="0.6" fill="#B9CEE0" opacity="0.35" />
          <circle cx="60" cy="90" r="0.5" fill="#B9CEE0" opacity="0.25" />
          <circle cx="95" cy="15" r="0.4" fill="#B9CEE0" opacity="0.3" />
          <circle cx="45" cy="55" r="0.3" fill="#B9CEE0" opacity="0.2" />
          <circle cx="100" cy="70" r="0.5" fill="#B9CEE0" opacity="0.25" />
        </pattern>
      </defs>

      {/* Base ice layers */}
      <rect width="572" height="700" fill="url(#rink-ice)" rx="20" ry="20" />
      <rect width="572" height="700" fill="url(#rink-shine)" rx="20" ry="20" />
      <rect width="572" height="700" fill="url(#rink-frost)" rx="20" ry="20" />

      {/* Blue zone lines */}
      <line x1="0" y1="244" x2="572" y2="244" stroke="#9EC0E0" strokeWidth="2" />
      <line x1="0" y1="456" x2="572" y2="456" stroke="#9EC0E0" strokeWidth="2" />

      {/* Center red line */}
      <line x1="0" y1="350" x2="572" y2="350" stroke="#D88B8B" strokeWidth="2" opacity="0.85" />

      {/* Goal lines — top (goal slides along) + bottom (shooter slides along) */}
      <line x1="0" y1="80" x2="572" y2="80" stroke="#D88B8B" strokeWidth="2" opacity="0.85" />
      <line x1="0" y1="620" x2="572" y2="620" stroke="#D88B8B" strokeWidth="2" opacity="0.85" />

      {/* Goal creases — half-circles on the goal line (y=80 top, y=610 bottom),
           r=40, centered on goal x=286. Blue fill, red outline. */}
      <path
        d="M 246 80 A 40 40 0 0 0 326 80 Z"
        fill="#CFE0EE"
        stroke="#D88B8B"
        strokeWidth="1.2"
        opacity="0.85"
      />
      <path
        d="M 246 620 A 40 40 0 0 1 326 620 Z"
        fill="#CFE0EE"
        stroke="#D88B8B"
        strokeWidth="1.2"
        opacity="0.85"
      />

      {/* Neutral-zone faceoff dots */}
      <circle cx="186" cy="297" r="4" fill="#E3B5B5" />
      <circle cx="386" cy="297" r="4" fill="#E3B5B5" />
      <circle cx="186" cy="404" r="4" fill="#E3B5B5" />
      <circle cx="386" cy="404" r="4" fill="#E3B5B5" />

      {/* Attack-zone faceoff circles */}
      <AttackFaceoff cx={150} cy={169} />
      <AttackFaceoff cx={422} cy={169} />
      <AttackFaceoff cx={150} cy={531} />
      <AttackFaceoff cx={422} cy={531} />

      {/* Center circle */}
      <circle cx="286" cy="350" r="64" stroke="#C7D5E3" strokeWidth="2" fill="none" />
      <circle cx="286" cy="350" r="5" fill="#C7D5E3" />
    </svg>
  );
}

function AttackFaceoff({ cx, cy }: { cx: number; cy: number }): JSX.Element {
  return (
    <g>
      <circle cx={cx} cy={cy} r="56" stroke="#E3B5B5" strokeWidth="2" fill="none" opacity="0.8" />
      <circle cx={cx} cy={cy} r="4" fill="#E3B5B5" />
      <line x1={cx - 9} y1={cy - 6} x2={cx + 9} y2={cy - 6} stroke="#E3B5B5" strokeWidth="1.5" opacity="0.8" />
      <line x1={cx - 9} y1={cy + 6} x2={cx + 9} y2={cy + 6} stroke="#E3B5B5" strokeWidth="1.5" opacity="0.8" />
    </g>
  );
}
