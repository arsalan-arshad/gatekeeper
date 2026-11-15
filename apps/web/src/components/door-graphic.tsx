export type DoorState = 'idle' | 'open' | 'closed';

/** Animated principal door — opens with green glow on accept, slams shut on reject/spam. */
export function DoorGraphic({ state = 'idle' }: { state?: DoorState }) {
  const leafClass =
    state === 'open'
      ? 'door-leaf-open'
      : state === 'closed'
        ? 'door-leaf-closed'
        : 'door-leaf-idle';

  const glowClass =
    state === 'open' ? 'door-glow-accept' : state === 'closed' ? 'door-glow-reject' : 'door-glow';

  return (
    <div
      className={`relative mx-auto aspect-[3/5] w-full max-w-[14rem] sm:max-w-[16rem] ${
        state === 'closed' ? 'door-frame-slam' : ''
      }`}
      aria-hidden
    >
      <div
        className={`absolute inset-[-14%] rounded-[50%] blur-2xl transition-opacity duration-500 ${glowClass}`}
        style={{
          background:
            state === 'open'
              ? 'radial-gradient(circle, rgba(95,212,164,0.55), transparent 68%)'
              : state === 'closed'
                ? 'radial-gradient(circle, rgba(180,60,60,0.22), transparent 70%)'
                : 'radial-gradient(circle, var(--glow), transparent 68%)',
        }}
      />
      <svg
        viewBox="0 0 160 260"
        className="relative h-full w-full overflow-visible drop-shadow-[0_0_48px_rgba(95,212,164,0.12)]"
        role="presentation"
      >
        <defs>
          <linearGradient id="door-frame" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a2c24" />
            <stop offset="55%" stopColor="#0d1713" />
            <stop offset="100%" stopColor="#080e0b" />
          </linearGradient>
          <linearGradient id="door-leaf" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#15221c" />
            <stop offset="55%" stopColor="#0c1411" />
            <stop offset="100%" stopColor="#101a16" />
          </linearGradient>
          <linearGradient id="door-inner-open" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(95,212,164,0.4)" />
            <stop offset="55%" stopColor="rgba(95,212,164,0)" />
          </linearGradient>
          <linearGradient id="door-inner-idle" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(95,212,164,0.1)" />
            <stop offset="40%" stopColor="rgba(95,212,164,0)" />
          </linearGradient>
          <linearGradient id="door-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="50%" stopColor="rgba(238,243,239,0.18)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Arch frame */}
        <path
          d="M20 250 V90 A60 70 0 0 1 140 90 V250 Z"
          fill="url(#door-frame)"
          stroke="rgba(95,212,164,0.28)"
          strokeWidth="2"
        />

        {/* Inner light */}
        <path
          d="M42 235 V105 A38 48 0 0 1 118 105 V235 Z"
          fill={state === 'open' ? 'url(#door-inner-open)' : 'url(#door-inner-idle)'}
          opacity={state === 'open' ? 1 : state === 'closed' ? 0.25 : 0.65}
          className="transition-opacity duration-700"
        />

        {/* Door leaf — hinged on left */}
        <g className={leafClass}>
          <path
            d="M42 235 V100 A36 44 0 0 1 118 100 V235 Z"
            fill="url(#door-leaf)"
            stroke="rgba(238,243,239,0.12)"
            strokeWidth="1.5"
          />
          <circle cx="102" cy="160" r="5" fill="rgba(95,212,164,0.75)" />
          {[58, 72, 86, 100].map((x) => (
            <rect
              key={x}
              x={x}
              y={118}
              width="2.5"
              height="90"
              rx="1"
              fill="var(--accent)"
              opacity={state === 'open' ? 0.25 : 0.7}
            />
          ))}
        </g>

        <rect
          className="light-sweep"
          x="20"
          y="40"
          width="36"
          height="210"
          fill="url(#door-sweep)"
          opacity="0.35"
          style={{ pointerEvents: 'none' }}
        />
      </svg>
    </div>
  );
}
