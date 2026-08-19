import { useEffect } from 'react';

// The driven-tour visual: a dim backdrop + a bottom-anchored card. Not a spotlight/cutout — the
// current step's target (if any) just gets a glow ring via .tutorial-highlight, applied/removed
// here rather than baked into every target component. No-ops safely if the target isn't in the DOM
// (e.g. a first-time account has no populated Schedule/Academics content yet).
export default function TutorialOverlay({ step, stepIndex, totalSteps, isFirst, onNext, onBack, onFinish, onSkip }) {
  // The tutorial card is fixed to the bottom of the screen — on a short page (e.g. a fresh account
  // with only a couple of preview cards) the page can be shorter than the viewport, leaving no room
  // to scroll a low-lying target clear of the card no matter what scrollIntoView does. Reserving
  // bottom padding equal to the card's own height guarantees that room always exists. Runs once for
  // the tutorial's whole lifetime (mount/unmount), not per-step, so it doesn't fight the page's own
  // layout between steps.
  useEffect(() => {
    return () => {
      document.body.style.paddingBottom = '';
    };
  }, []);

  // No dependency array on purpose: a step's onEnter (see tutorialSteps.js) can itself trigger a
  // page transition (opening Settings, switching tabs) via a second, separate state update — the
  // target element for THIS step doesn't exist in the DOM until that follow-up render commits, one
  // render after `step` itself changed. Re-running on every render (cheap: a classList add/remove)
  // is what lets this effect catch that follow-up render instead of only the first, too-early one.
  useEffect(() => {
    const cardEl = document.querySelector('.tutorial-card');
    const cardHeight = cardEl ? cardEl.getBoundingClientRect().height : 0;
    document.body.style.paddingBottom = `${Math.round(cardHeight) + 24}px`;

    if (!step.highlight) return undefined;
    const el = document.querySelector(step.highlight);
    if (!el) return undefined;
    el.classList.add('tutorial-highlight');

    // The tutorial card is bottom-anchored and can cover the lower part of the screen, so "visible"
    // means above the card, not just above window.innerHeight. Only scrolls when the target isn't
    // already fully in view — this effect re-runs on every render (see comment above), so an
    // unconditional scrollIntoView here would re-scroll (and fight a user's own scrolling) on every
    // unrelated re-render instead of just the one time it's actually needed.
    const cardTop = cardEl ? cardEl.getBoundingClientRect().top : window.innerHeight;
    const rect = el.getBoundingClientRect();
    const fullyVisible = rect.top >= 0 && rect.bottom <= cardTop;
    if (!fullyVisible) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return () => el.classList.remove('tutorial-highlight');
  });

  return (
    <div className="tutorial-backdrop">
      <div className="tutorial-card">
        <p className="tutorial-card-step">
          {step.section} · {stepIndex + 1} / {totalSteps}
        </p>
        {step.image && <img className="tutorial-card-image" src={step.image} alt={step.imageCaption || step.section} />}
        <p className="tutorial-card-body">{step.body}</p>
        <div className="tutorial-card-actions">
          {!isFirst && (
            <button type="button" className="secondary-btn" onClick={onBack}>
              Back
            </button>
          )}
          {step.finish ? (
            <button type="button" className="primary-btn" onClick={onFinish}>
              Finish Tutorial
            </button>
          ) : (
            <>
              <button type="button" className="primary-btn" onClick={onNext}>
                Next
              </button>
              <button type="button" className="back-link tutorial-skip-link" onClick={onSkip}>
                Skip tutorial
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
