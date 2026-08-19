import { useState } from 'react';
import { useBackHandler } from '../hooks/useBackButton.js';

// Replaces both the hamburger drawer and the command bar. A compass badge sits fixed at the top of
// the screen; tapping it swings the 4 destinations out into a downward arc around it, like small
// planets released from the dial, instead of a dropdown list.
//
// Positions come from real angular spacing around the dial rather than hand-picked pixel offsets —
// hardcoded offsets previously placed the two inner pills (Schedule/Academics) closer together than
// the outer two, so at 84px-wide pills the inner pair visually overlapped. Splitting a fixed arc span
// into equal angle steps guarantees every pill sits the same angular distance from its neighbors, and
// the radius is chosen so even the closest pair (the two inner ones, which subtend the same 40° step
// as every other consecutive pair) clears 84px + a gap.
const ARC_RADIUS = 150;
const ARC_SPAN_DEG = 120;
const TAB_DEFS = [
  { key: 'home', label: 'Home' },
  { key: 'schedule', label: 'Calendar' },
  { key: 'academics', label: 'Academics' },
  { key: 'more', label: 'More' },
];
const TABS = TAB_DEFS.map((tab, i) => {
  const angleDeg = -ARC_SPAN_DEG / 2 + (i / (TAB_DEFS.length - 1)) * ARC_SPAN_DEG;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    ...tab,
    x: Math.round(ARC_RADIUS * Math.sin(angleRad)),
    y: Math.round(ARC_RADIUS * Math.cos(angleRad)),
  };
});

export default function OrbitDial({ activeTab, onSwitchTab }) {
  const [open, setOpen] = useState(false);

  useBackHandler(open, () => setOpen(false));

  return (
    <>
      {open && <div className="orbit-dial-backdrop" onClick={() => setOpen(false)} />}
      <div className="orbit-dial-wrap">
        <button
          type="button"
          className={open ? 'orbit-dial open' : 'orbit-dial'}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Open navigation"
        >
          <span className="orbit-dial-ring" />
          <span className="orbit-dial-needle" />
        </button>

        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? 'orbit-dial-planet active' : 'orbit-dial-planet'}
            style={
              open
                ? { transform: `translate(${tab.x}px, ${tab.y}px) scale(1)`, opacity: 1, pointerEvents: 'auto' }
                : undefined
            }
            tabIndex={open ? 0 : -1}
            onClick={() => {
              onSwitchTab(tab.key);
              setOpen(false);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </>
  );
}
