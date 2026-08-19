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
  const [pickedIdentity, setPickedIdentity] = useState(
    lockedSubject ? subjectIdentity(lockedSubject.subjectKey, lockedSubject.subjectLabel) : ''
  );

  const termData = terms.find((t) => t.term === selectedTerm);

  const subjectOptions = (termData?.subjectAverages || []).map((s) => ({
    identity: subjectIdentity(s.subjectKey, s.subjectLabel),
    subjectKey: s.subjectKey || null,
    subjectLabel: s.subjectLabel,
  }));

  const selected = lockedSubject
    ? { ...lockedSubject, identity: subjectIdentity(lockedSubject.subjectKey, lockedSubject.subjectLabel) }
    : subjectOptions.find((s) => s.identity === pickedIdentity) || null;

  const existingGoal =
    mode === 'overall' ? termData?.goals?.overall || null : selected ? termData?.goals?.subjects?.[selected.identity] || null : null;

  const [targetValue, setTargetValue] = useState(existingGoal ? String(existingGoal.targetAverage) : '');
  const [submitting, setSubmitting] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [savedNotice, setSavedNotice] = useState('');

  function switchMode(nextMode) {
    setMode(nextMode);
    setPickedIdentity('');
    setTargetValue('');
    setResult(null);
    setError('');
    setSavedNotice('');
  }

  function selectSubject(identity) {
    setPickedIdentity(identity);
    const goal = termData?.goals?.subjects?.[identity];
    setTargetValue(goal ? String(goal.targetAverage) : '');
    setResult(null);
    setError('');
    setSavedNotice('');
  }

  function parsedTarget() {
    const targetNum = Number(targetValue);
    if (!Number.isFinite(targetNum) || targetNum < 0 || targetNum > 100) return null;
    return targetNum;
  }

  async function handleCalculate() {
    if (!selected) {
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
        const data = await api.calculateOverallTarget({
          term: selectedTerm,
          subjectKey: selected.subjectKey,
          subjectLabel: selected.subjectLabel,
          targetOverallAverage: targetNum,
        });
        setResult(data);
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
      await onSetGoal({
        term: selectedTerm,
        kind: mode,
        subjectKey: mode === 'subject' ? selected?.subjectKey : null,
        subjectLabel: mode === 'subject' ? selected?.subjectLabel : null,
        targetAverage: targetNum,
      });
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
                  setPickedIdentity('');
                  setTargetValue('');
                  setResult(null);
                  setError('');
                  setSavedNotice('');
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
              {mode === 'subject' ? 'Pick a subject and a target average for it.' : 'Pick a subject to solve for a target overall term average.'}
            </p>
            {subjectOptions.length === 0 ? (
              <p className="subtle">No graded subjects yet this term. Add a grade first, or open this from a subject's Goal badge.</p>
            ) : (
              <div className="manual-subject-list">
                {subjectOptions.map((s) => (
                  <button
                    type="button"
                    key={s.identity}
                    className={pickedIdentity === s.identity ? 'manual-subject-row active' : 'manual-subject-row'}
                    onClick={() => selectSubject(s.identity)}
                  >
                    {s.subjectLabel}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {selected && (
          <>
            <label>
              {mode === 'subject' ? 'Target average for this subject' : 'Target overall average'}
              <input
                type="number"
                min="0"
                max="100"
                value={targetValue}
                onChange={(e) => {
                  setTargetValue(e.target.value);
                  setResult(null);
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

        {result && mode === 'overall' && (
          <div className={`calculator-result ${result.feasible ? '' : 'calculator-result-infeasible'}`}>
            <p>
              Current overall average: <strong>{result.currentOverallAverage.toFixed(1)}</strong>
            </p>
            {result.lowImpact ? (
              <p className="calculator-low-impact-note">{result.lowImpactMessage}</p>
            ) : result.feasible ? (
              <p>
                {selected?.subjectLabel} needs to average <strong>{result.neededSubjectAverage.toFixed(1)}</strong> to hit that overall target.
              </p>
            ) : (
              <p>
                Not reachable through this subject alone. Even a perfect 100 in {selected?.subjectLabel} only brings your overall to{' '}
                <strong>{result.bestPossibleOverall.toFixed(1)}</strong>.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
