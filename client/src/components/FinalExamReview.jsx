import { useState } from 'react';
import { api } from '../api.js';
import { formatDate } from '../utils.js';
import ConfirmDialog from './ConfirmDialog.jsx';

// Final-exam extraction reads a dense, non-uniform grid and can misattribute a cell to the wrong
// subject or column — so instead of writing straight to the student's calendar, the upload lands
// here first. Removing a bad row is a five-second fix; a bad row that silently made it into the
// calendar is something the student has to notice on their own later.
export default function FinalExamReview({ uploadId, term, exams, onDone, onCancel }) {
  const [rows, setRows] = useState(() =>
    [...exams]
      .map((e, i) => ({ ...e, _id: i }))
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a._id - b._id)
  );
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [error, setError] = useState('');

  function removeRow(id) {
    setRows((prev) => prev.filter((r) => r._id !== id));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await api.finalizeScheduleReview(
        uploadId,
        rows.map(({ _id, ...rest }) => rest)
      );
      await onDone();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  async function handleDiscard() {
    setDiscarding(true);
    setError('');
    try {
      await api.discardScheduleReview(uploadId);
      onCancel();
    } catch (err) {
      setError(err.message);
      setDiscarding(false);
    }
  }

  return (
    <div className="page-screen">
      <div className="review-card">
        <h1>Review Final Exams</h1>
        <p className="subtle">
          {exams.length === 0
            ? `No exams were found for Term ${term}.`
            : `Found ${exams.length} exam${exams.length === 1 ? '' : 's'} for Term ${term}. Remove anything that looks wrong before saving.`}
        </p>

        {rows.length === 0 ? (
          <p className="subtle review-empty">Nothing left to save.</p>
        ) : (
          <ul className="review-list">
            {rows.map((r) => (
              <li key={r._id} className="review-row">
                <div className="review-row-info">
                  <div className="review-row-subject">{r.subjectLabel}</div>
                  <div className="review-row-meta">
                    {formatDate(r.date)}
                    {r.time ? ` · ${r.time}` : ''}
                  </div>
                  {r.notes && <div className="review-row-notes">{r.notes}</div>}
                  {!r.matchedSubjectKey && (
                    <div className="review-row-unmatched">Not linked to one of your subjects</div>
                  )}
                </div>
                <button
                  type="button"
                  className="review-row-remove"
                  onClick={() => removeRow(r._id)}
                  aria-label={`Remove ${r.subjectLabel}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="review-actions">
          <button
            type="button"
            className="secondary-btn danger-hover-btn"
            onClick={() => setConfirmingDiscard(true)}
            disabled={saving || discarding}
          >
            Discard Upload
          </button>
          <button
            type="button"
            className={rows.length === 0 ? 'primary-btn danger-btn' : 'primary-btn'}
            onClick={handleSave}
            disabled={saving || discarding}
          >
            {saving
              ? 'Saving…'
              : rows.length === 0
                ? `Clear Term ${term} Finals`
                : `Save ${rows.length} Exam${rows.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {confirmingDiscard && (
        <ConfirmDialog
          message="Discard this upload? Nothing you found here will be saved."
          confirmLabel="Discard"
          danger
          busy={discarding}
          error={error}
          onCancel={() => setConfirmingDiscard(false)}
          onConfirm={handleDiscard}
        />
      )}
    </div>
  );
}
