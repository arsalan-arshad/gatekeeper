export type DoorState = 'idle' | 'open' | 'closed';

/** Animated principal door — opens on accept, closes on reject/spam. */
export function DoorGraphic({ state = 'idle' }: { state?: DoorState }) {
  const leafClass =
    state === 'open' ? 'door-leaf-open' : state === 'closed' ? 'door-leaf-closed' : 'door-leaf-idle';

  return (
    <div className="relative mx-auto aspect-[3/5] w-full max-w-[14rem] sm:max-w-[16rem]" aria-hidden>
      <div className="door-glow absolute inset-[-10%] rounded-[50%] bg-[radial-gradient(circle,var(--glow),transparent_68%)] blur-2xl" />
      <div className="relative h-full overflow-hidden rounded-t-[999px] border border-[rgba(95,212,164,0.28)] bg-[linear-gradient(180deg,#1a2c24_0%,#0d1713_55%,#080e0b_100%)] shadow-[0_0_80px_rgba(95,212,164,0.12)]">
        {/* Inner light */}
        <div
          className={`absolute inset-x-[18%] top-[22%] bottom-[12%] rounded-t-[999px] border border-[rgba(238,243,239,0.08)] transition-opacity duration-700 ${
            state === 'open' ? 'opacity-100' : state === 'closed' ? 'opacity-20' : 'opacity-60'
          }`}
          style={{
            background:
              state === 'open'
                ? 'linear-gradient(180deg, rgba(95,212,164,0.35), transparent 55%)'
                : 'linear-gradient(180deg, rgba(95,212,164,0.08), transparent 40%)',
          }}
        />
        {/* Door leaf */}
        <div
          className={`absolute inset-y-[10%] left-[12%] right-[12%] origin-left rounded-t-[40%] border border-[rgba(238,243,239,0.12)] bg-[linear-gradient(105deg,#15221c_0%,#0c1411_55%,#101a16_100%)] ${leafClass}`}
        >
          <div className="absolute right-[18%] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[var(--accent)]/70" />
          {/* Portcullis bars */}
          <div className="absolute inset-x-[22%] top-[28%] bottom-[18%] flex justify-between">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`w-0.5 rounded-full bg-[var(--accent)] transition-opacity duration-500 ${
                  state === 'open' ? 'opacity-25' : 'opacity-70'
                }`}
              />
            ))}
          </div>
        </div>
        <div className="light-sweep absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(238,243,239,0.14),transparent)]" />
      </div>
    </div>
  );
}
