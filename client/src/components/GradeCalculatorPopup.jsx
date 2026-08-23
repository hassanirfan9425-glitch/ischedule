import { useState } from 'react';
import { api } from '../api.js';

function subjectIdentity(subjectKey, subjectLabel) {
  return subjectKey || `label:${subjectLabel}`;
}

// One popup owns both setting a goal and calculating what's needed to hit it — they used to be two
// separate features (a chunky inline editor in every table row, plus this popup with no connection
// to it), which was confusing and, worse, let the popup's own subject picker point at a different
// underlying subject record than the one actually shown in the table. Opening this from a specific
// subject's badge (via `initialContext`) sidesteps that entirely: the subject is locked to the
// exact record the badge came from, no re-picking involved. The general "What grade do I need?"
// button (no initialContext) still shows a picker, but only over subjects that already have
// entries this term, for the same reason.
//
// Back-button handling is owned by the parent Academics page's single useBackHandler call, matching
// every other popup in the app.
export default function GradeCalculatorPopup({ terms, currentTerm, initialContext, onSetGoal, onDeleteGoal, onClose }) {
  const locked = initialContext?.kind === 'subject' || initialContext?.kind === 'overall';
  const [mode, setMode] = useState(initialContext?.kind || 'subject');
  // currentTerm is computed independently (from the schedule) and isn't guaranteed to be one of
  // the terms that actually has grade data — falling back straight to state left selectedTerm
  // pointing at a term number nothing matched, while termData below silently fell back to
  // terms[0] for display. That meant the picker showed subjects from the right term but every
  // Calculate call sent the wrong one, so the API found no entries and answered as if nothing had
  // been graded yet. Resolving the real starting term up front keeps the two in sync always.
  const wantedTerm = initialContext?.term || currentTerm;
  const initialTerm = terms.find((t) => t.term === wantedTerm)?.term ?? terms[0]?.term ?? wantedTerm;
  const [selectedTerm, setSelectedTerm] = useState(initialTerm);
  const lockedSubject =
    initialContext?.kind === 'subject'
      ? { subjectKey: initialContext.subjectKey || null, subjectLabel: initialContext.subjectLabel }
      : null;
  // Per-Subject mode stays single-select — Calculate and goal-saving both point at exactly one
  // subject's own entries. Overall Term mode allows picking several subjects: each selected
  // subject gets its own independent "what would THIS one need, holding every other subject's
  // average fixed" answer against the same shared target overall average — a real calculation
  // per subject (calculateOverallTarget called once per pick), not a made-up multi-subject solve.
  const [pickedIdentities, setPickedIdentities] = useState(
    lockedSubject ? [subjectIdentity(lockedSubject.subjectKey, lockedSubject.subjectLabel)] : []
  );

  const termData = terms.find((t) => t.term === selectedTerm);

  const subjectOptions = (termData?.subjectAverages || []).map((s) => ({
    identity: subjectIdentity(s.subjectKey, s.subjectLabel),
    subjectKey: s.subjectKey || null,
    subjectLabel: s.subjectLabel,
  }));

  const selectedList = lockedSubject
    ? [{ ...lockedSubject, identity: subjectIdentity(lockedSubject.subjectKey, lockedSubject.subjectLabel) }]
    : subjectOptions.filter((s) => pickedIdentities.includes(s.identity));
  // Per-Subject mode only ever has 0 or 1 entries here (picking always replaces). Overall mode can
  // have several — `selected` is only meaningful for the single-subject case.
  const selected = selectedList.length === 1 ? selectedList[0] : null;

  const existingGoal =
    mode === 'overall'
      ? termData?.goals?.overall || null
      : selected
        ? termData?.goals?.subjects?.[selected.identity] || null
        : null;

  const [targetValue, setTargetValue] = useState(existingGoal ? String(existingGoal.targetAverage) : '');
  const [submitting, setSubmitting] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  // Overall mode's Calculate returns one response covering every selected subject at once (a set
  // of named scenarios — see handleCalculate) — kept separate from `result` (Per-Subject's
  // single-subject shape) rather than overloading one state with two different response shapes.
  const [overallResult, setOverallResult] = useState(null);
  const [savedNotice, setSavedNotice] = useState('');

  function resetTransient() {
    setResult(null);
    setOverallResult(null);
    setError('');
    setSavedNotice('');
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setPickedIdentities([]);
    setTargetValue('');
    resetTransient();
  }

  // Per-Subject mode: picking a subject replaces the selection (Calculate/goal both need exactly
  // one concrete subject to point at).
  function pickSingleSubject(identity) {
    setPickedIdentities([identity]);
    const goal = termData?.goals?.subjects?.[identity];
    setTargetValue(goal ? String(goal.targetAverage) : '');
    resetTransient();
  }

  // Overall Term mode: picking toggles that subject in/out of the multi-select set used for the
  // per-subject "what would this one need" breakdown.
  function toggleSubject(identity) {
    setPickedIdentities((prev) => (prev.includes(identity) ? prev.filter((id) => id !== identity) : [...prev, identity]));
    resetTransient();
  }

  function parsedTarget() {
    const targetNum = Number(targetValue);
    if (!Number.isFinite(targetNum) || targetNum < 0 || targetNum > 100) return null;
    return targetNum;
  }

  async function handleCalculate() {
    if (selectedList.length === 0) {
      setError('Pick a subject first.');
      return;
    }
    const targetNum = parsedTarget();
    if (targetNum === null) {
      setError('Target must be a number between 0 and 100.');
      return;
    }
    setSubmitting(true);
    setError('');
    setResult(null);
    setOverallResult(null);
    try {
      if (mode === 'subject') {
        const data = await api.calculateSubjectTarget({
          term: selectedTerm,
          subjectKey: selected.subjectKey,
          subjectLabel: selected.subjectLabel,
          targetAverage: targetNum,
        });
        setResult(data);
      } else {
        // One call covering every selected subject at once — the backend returns a "balanced"
        // scenario (everyone moves evenly) plus, for 2+ subjects, one "spotlight" scenario per
        // subject (every other selected subject maxed at 100, solve for this one alone).
        const data = await api.calculateOverallTarget({
          term: selectedTerm,
          subjects: selectedList.map((s) => ({ subjectKey: s.subjectKey, subjectLabel: s.subjectLabel })),
          targetOverallAverage: targetNum,
        });
        setOverallResult(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveGoal() {
    const targetNum = parsedTarget();
    if (targetNum === null) {
      setError('Target must be a number between 0 and 100.');
      return;
    }
    setSavingGoal(true);
    setError('');
    try {
      if (mode === 'subject') {
        await onSetGoal({
          term: selectedTerm,
          kind: 'subject',
          subjectKey: selected?.subjectKey,
          subjectLabel: selected?.subjectLabel,
          targetAverage: targetNum,
        });
      } else {
        // The overall goal is a single term-wide number, not tied to whichever subjects are
        // selected for the Calculate breakdown above.
        await onSetGoal({ term: selectedTerm, kind: 'overall', subjectKey: null, subjectLabel: null, targetAverage: targetNum });
      }
      setSavedNotice('Goal saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleRemoveGoal() {
    if (!existingGoal) return;
    setSavingGoal(true);
    setError('');
    try {
      await onDeleteGoal(existingGoal.id);
      setSavedNotice('Goal removed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingGoal(false);
    }
  }

  const title = mode === 'overall' ? 'Overall Term Goal' : selected ? selected.subjectLabel : 'What grade do I need?';

  return (
    <div className="confirm-backdrop" onClick={onClose}>
      <div className="material-popup" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="material-popup-header">
          <div className="material-popup-subject">{title}</div>
        </div>

        {terms.length > 1 && !initialContext?.term && (
          <div className="tab-switch">
            {terms.map((t) => (
              <button
                key={t.term}
                type="button"
                className={selectedTerm === t.term ? 'tab active' : 'tab'}
                onClick={() => {
                  setSelectedTerm(t.term);
                  setPickedIdentities([]);
                  setTargetValue('');
                  resetTransient();
                }}
              >
                Term {t.term}
              </button>
            ))}
          </div>
        )}

        {!locked && (
          <div className="tab-switch">
            <button type="button" className={mode === 'subject' ? 'tab active' : 'tab'} onClick={() => switchMode('subject')}>
              Per-Subject
            </button>
            <button type="button" className={mode === 'overall' ? 'tab active' : 'tab'} onClick={() => switchMode('overall')}>
              Overall Term
            </button>
          </div>
        )}

        {!lockedSubject && (
          <>
            <p className="subtle" style={{ margin: 0 }}>
              {mode === 'subject'
                ? 'Pick a subject and a target average for it.'
                : 'Pick one or more subjects to see what each would need to reach a target overall average.'}
            </p>
            {subjectOptions.length === 0 ? (
              <p className="subtle">No graded subjects yet this term. Add a grade first, or open this from a subject's Goal badge.</p>
            ) : (
              <div className="manual-subject-list">
                {subjectOptions.map((s) => (
                  <button
                    type="button"
                    key={s.identity}
                    className={pickedIdentities.includes(s.identity) ? 'manual-subject-row active' : 'manual-subject-row'}
                    onClick={() => (mode === 'subject' ? pickSingleSubject(s.identity) : toggleSubject(s.identity))}
                  >
                    {s.subjectLabel}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {selectedList.length > 0 && (
          <>
            <label>
              {mode === 'subject'
                ? 'Target average for this subject'
                : selectedList.length === 1
                  ? 'Target overall average'
                  : `Target overall average (checked against all ${selectedList.length} selected subjects)`}
              <input
                type="number"
                min="0"
                max="100"
                value={targetValue}
                onChange={(e) => {
                  setTargetValue(e.target.value);
                  setResult(null);
                  setOverallResult(null);
                  setSavedNotice('');
                }}
              />
            </label>

            {error && <p className="error-text">{error}</p>}
            {savedNotice && <p className="subtle">{savedNotice}</p>}

            <div className="grade-add-actions">
              <button type="button" className="primary-btn" onClick={handleCalculate} disabled={submitting}>
                {submitting ? 'Calculating…' : 'Calculate'}
              </button>
              <button type="button" className="secondary-btn" onClick={handleSaveGoal} disabled={savingGoal}>
                {savingGoal ? 'Saving…' : existingGoal ? 'Update Goal' : 'Save as Goal'}
              </button>
            </div>
            {existingGoal && (
              <button type="button" className="back-link" onClick={handleRemoveGoal} disabled={savingGoal}>
                Remove Goal
              </button>
            )}
          </>
        )}

        {result && mode === 'subject' && (
          <div className={`calculator-result ${result.periodic.feasible || result.ams.feasible ? '' : 'calculator-result-infeasible'}`}>
            {result.currentAverage !== null ? (
              <p>
                Current average: <strong>{result.currentAverage.toFixed(1)}</strong>
              </p>
            ) : (
              <p className="subtle">No grades yet this term. Your first entry would just need to be your target itself.</p>
            )}
            {result.currentAverage !== null && (
              <>
                <p>
                  {result.periodic.feasible ? (
                    <>
                      Periodic: need <strong>{result.periodic.neededScore.toFixed(1)}</strong> in your upcoming periodic exam
                      {result.periodic.assessmentCount === 1 ? '' : 's'}.
                    </>
                  ) : (
                    <>Periodic: not reachable, best possible is {result.periodic.bestPossibleAverage.toFixed(1)}.</>
                  )}
                </p>
                <p>
                  {result.ams.feasible ? (
                    <>
                      AMS: need <strong>{result.ams.neededScore.toFixed(1)}</strong> averaged across your {result.ams.everyWeekCount} remaining
                      weeks of AMS.
                    </>
                  ) : (
                    <>AMS: not reachable, best possible is {result.ams.bestPossibleAverage.toFixed(1)}.</>
                  )}
                </p>
                {result.combined && (
                  <p>
                    {result.combined.alreadyMetByAmsAlone ? (
                      <>A realistic path: 100 across your remaining AMS alone already gets you there, even without touching your periodic score.</>
                    ) : result.combined.feasible ? (
                      <>
                        A realistic path: get <strong>100</strong> across your {result.combined.amsCount} remaining AMS entries, and{' '}
                        <strong>{result.combined.neededPeriodicScore.toFixed(1)}</strong> in your upcoming periodic exam
                        {result.combined.periodicCount === 1 ? '' : 's'}.
                      </>
                    ) : (
                      <>
                        Not reachable even with 100 across all remaining AMS and periodic entries. Best possible is{' '}
                        {result.combined.bestPossibleAverage.toFixed(1)}.
                      </>
                    )}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {overallResult && mode === 'overall' && (
          <>
            <p style={{ marginTop: 10 }}>
              Current overall average: <strong>{overallResult.currentOverallAverage.toFixed(1)}</strong>
            </p>
            {overallResult.lowImpact ? (
              <p className="calculator-low-impact-note">{overallResult.lowImpactMessage}</p>
            ) : (
              overallResult.scenarios.map((sc) => {
                // Spotlight scenarios already say "if the others get 100" in the label itself, so
                // only the one subject actually being solved for needs its number called out here.
                // Repeating everyone's value (including the 100s already named above) would just
                // restate the label. The balanced scenario has no single "needs" figure, so it
                // lists every subject's value instead.
                const spotlightIdentity = sc.name.startsWith('spotlight:') ? sc.name.slice('spotlight:'.length) : null;
                const spotlightSubject = spotlightIdentity
                  ? overallResult.subjects.find((s) => s.identity === spotlightIdentity)
                  : null;
                return (
                  <div
                    key={sc.name}
                    className={`calculator-result ${sc.feasible ? '' : 'calculator-result-infeasible'}`}
                    style={{ marginTop: 8 }}
                  >
                    <p style={{ fontWeight: 700, margin: '0 0 4px' }}>{sc.label}</p>
                    {sc.feasible ? (
                      spotlightSubject ? (
                        <p>
                          <strong>{sc.values[spotlightSubject.identity].toFixed(1)}</strong>
                        </p>
                      ) : (
                        <p>
                          {overallResult.subjects.map((subj, i) => (
                            <span key={subj.identity}>
                              {i > 0 ? ', ' : ''}
                              {subj.subjectLabel}: <strong>{sc.values[subj.identity].toFixed(1)}</strong>
                            </span>
                          ))}
                        </p>
                      )
                    ) : (
                      <p>
                        Not reachable this way. Even at the extremes, the best this scenario gets your overall to is{' '}
                        <strong>{overallResult.bestPossibleOverall.toFixed(1)}</strong>.
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
