import { useEffect } from 'react';

// A tiny shared stack so any open overlay (drawer, dialog, sub-view) can claim the Android hardware
// back button while it's open, regardless of which page component owns that state. The App-level
// listener (see App.jsx) only falls through to tab/exit handling when this stack is empty — this is
// what makes "back" close the topmost thing instead of quitting the whole app.
const stack = [];

export function pushBackHandler(handler) {
  stack.push(handler);
  return () => {
    const idx = stack.lastIndexOf(handler);
    if (idx !== -1) stack.splice(idx, 1);
  };
}

export function hasBackHandler() {
  return stack.length > 0;
}

export function popBackHandler() {
  const handler = stack[stack.length - 1];
  if (handler) handler();
}

// Call with `active` true whenever this component currently owns "something back should close" —
// e.g. active = drawerOpen || confirmingDelete. The handler itself decides which one to close first.
export function useBackHandler(active, handler) {
  useEffect(() => {
    if (!active) return undefined;
    return pushBackHandler(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
