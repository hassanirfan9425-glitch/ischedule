import { useState } from 'react';
import { api } from '../api.js';

const DIRECTION_TEXT = {
  worse: 'went worse than expected',
  better: 'went better than expected',
};

export default function DifficultyNudgePopup({ nudge, difficulties, onClose, onResolved }) {
  const [selected, setSelected] = useState(nudge.currentDifficulty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const currentLabel = difficulties.find((d) => d.key === nudge.currentDifficulty)?.label ?? nudge.currentDifficulty;

  async function dismissAndClose() {
    setSubmitting(true);
    setError('');
    try {
      await api.dismissReflectionNudge(nudge.reflectionId);
      onResolved();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  async function handleSave() {
    setSubmitting(true);
    setError('');
    try {
      await api.updateSubjectDifficulty(nudge.subjectKey, selected);
      await api.dismissReflectionNudge(nudge.reflectionId);
      onResolved();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="confirm-backdrop" onClick={dismissAndClose}>
      <div className="material-popup" onClick={(e) => e.stopPropagation()}>
        <div className="popup-close-sticky">
          <button type="button" className="drawer-close" onClick={dismissAndClose} aria-label="Close" disabled={submitting}>
            ✕
          </button>
        </div>
        <div className="material-popup-header">
          <div className="material-popup-subject">{nudge.subjectLabel}</div>
        </div>

        <p>
          You rated {nudge.subjectLabel} <strong>{currentLabel}</strong>, but it {DIRECTION_TEXT[nudge.rating]} and
          your term average is {Math.round(nudge.termAverage)}. Want to re-rate it?
        </p>

        <div className="difficulty-picker">
          {difficulties.map((d) => (
            <button
              type="button"
              key={d.key}
              className={selected === d.key ? `difficulty-btn ${d.key} active` : `difficulty-btn ${d.key}`}
              onClick={() => setSelected(d.key)}
              disabled={submitting}
            >
              {d.label}
            </button>
          ))}
        </div>

        {error && <p className="error-text">{error}</p>}

        <button type="button" className="primary-btn" onClick={handleSave} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save new rating'}
        </button>
        <button type="button" className="secondary-btn" onClick={dismissAndClose} disabled={submitting}>
          Not now
        </button>
      </div>
    </div>
  );
}
