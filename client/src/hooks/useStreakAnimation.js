import { useEffect, useRef, useState } from 'react';

const ANIMATION_DURATION_MS = 1000;

function identityFor(s) {
  return s.subjectKey || `label:${s.subjectLabel}`;
}

// Detects streak transitions between renders of the same `subjectAverages` list (from
// termData.subjectAverages) and returns which subjects should play a one-shot animation right
// now — 'unlock' when a streak first becomes visible or recovers from "at risk", 'death' when it
// actually breaks. Never fires on first mount (nothing to compare against yet), only on a real
// change during the session — e.g. right after a grade edit reloads academicsData.
export function useStreakAnimation(subjectAverages) {
  const prevRef = useRef(new Map());
  const [animations, setAnimations] = useState({});

  useEffect(() => {
    const prev = prevRef.current;
    const next = new Map();
    const fired = {};

    for (const s of subjectAverages || []) {
      const identity = identityFor(s);
      const streak = s.amsStreak || 0;
      const status = s.amsStreakStatus || 'none';
      next.set(identity, { streak, status });

      const before = prev.get(identity);
      if (before) {
        const wasVisible = before.streak >= 2 && before.status !== 'none';
        const isVisible = streak >= 2 && status !== 'none';
        if (!wasVisible && isVisible) {
          fired[identity] = { type: 'unlock', streak };
        } else if (wasVisible && before.status === 'atRisk' && status === 'active' && streak > before.streak) {
          fired[identity] = { type: 'unlock', streak };
        } else if (wasVisible && !isVisible) {
          fired[identity] = { type: 'death', streak: before.streak };
        }
      }
    }

    prevRef.current = next;

    if (Object.keys(fired).length > 0) {
      setAnimations(fired);
      const timer = setTimeout(() => setAnimations({}), ANIMATION_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [subjectAverages]);

  return animations;
}
