import { useEffect, useState } from 'react';
import { tutorialSteps } from '../tutorial/tutorialSteps.js';

// Drives the post-onboarding "driven tour" (Home → menu → Settings → Schedule → Academics → Home).
// Each step fully declares the app state it needs via its own onEnter — see tutorialSteps.js —
// so next()/back() just move the index and the effect below re-applies whatever the new step wants.
export function useTutorial(active, { onSwitchTab, setViewingSettings }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [forceDrawerOpen, setForceDrawerOpen] = useState(false);
  const [drawerHighlightIndex, setDrawerHighlightIndex] = useState(null);

  const currentStep = tutorialSteps[stepIndex];

  useEffect(() => {
    if (!active) return;
    currentStep.onEnter?.({ onSwitchTab, setViewingSettings, setForceDrawerOpen, setDrawerHighlightIndex });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex]);

  return {
    currentStep,
    stepIndex,
    totalSteps: tutorialSteps.length,
    isFirst: stepIndex === 0,
    isLast: stepIndex === tutorialSteps.length - 1,
    forceDrawerOpen,
    drawerHighlightIndex,
    next: () => setStepIndex((i) => Math.min(i + 1, tutorialSteps.length - 1)),
    back: () => setStepIndex((i) => Math.max(i - 1, 0)),
  };
}
