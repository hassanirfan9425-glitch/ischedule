import { useState } from 'react';
import { useBackHandler } from '../hooks/useBackButton.js';

// Replaces the side-tabs entirely. A persistent terminal-prompt bar pinned to the top of the
// screen shows the current page like a command that was just run; tapping it drops down a small
// palette of the other destinations, styled like a list of runnable commands.
const TABS = [
  { key: 'home', label: 'home' },
  { key: 'schedule', label: 'calendar' },
  { key: 'academics', label: 'academics' },
  { key: 'more', label: 'more' },
];

export default function CommandBar({ activeTab, onSwitchTab }) {
  const [open, setOpen] = useState(false);
  const currentLabel = TABS.find((t) => t.key === activeTab)?.label || activeTab;

  useBackHandler(open, () => setOpen(false));

  return (
    <>
      <div className="command-bar-wrap">
        <button
          type="button"
          className={open ? 'command-bar open' : 'command-bar'}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span className="command-bar-prompt">cram:~$</span>
          <span className="command-bar-current">{currentLabel}</span>
          <span className="command-bar-cursor" />
        </button>

        {open && (
          <div className="command-palette">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? 'command-palette-item active' : 'command-palette-item'}
                onClick={() => {
                  onSwitchTab(tab.key);
                  setOpen(false);
                }}
              >
                <span className="command-palette-prompt">$</span> {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {open && <div className="command-backdrop" onClick={() => setOpen(false)} />}
    </>
  );
}
