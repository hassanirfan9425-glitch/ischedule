import { useState } from 'react';
import { formatDate } from '../utils.js';
import ConfirmDialog from './ConfirmDialog.jsx';

export default function MaterialPopup({ exam, onClose, onUpdate, onDelete }) {
  const { quizzes, questions, details = [], pastPapers = [] } = exam.material;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const dateLabel = exam.isExactDate
    ? formatDate(exam.date)
    : exam.dateStart && exam.dateEnd
      ? `${formatDate(exam.dateStart)} – ${formatDate(exam.dateEnd)}`
      : '';

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await onDelete();
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="confirm-backdrop" onClick={onClose}>
        <div className="material-popup" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
          <div className="material-popup-header">
            <div className="material-popup-subject">{exam.subjectLabel}</div>
            {dateLabel && <div className="material-popup-date">{dateLabel}</div>}
          </div>

          {quizzes.length === 0 && questions.length === 0 && details.length === 0 && pastPapers.length === 0 ? (
            <p className="subtle">No material was found in the attached file.</p>
          ) : (
            <>
              {quizzes.length > 0 && (
                <div className="material-group">
                  <h3>Quizzes</h3>
                  <ul>
                    {quizzes.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {questions.length > 0 && (
                <div className="material-group">
                  <h3>Questions</h3>
                  <ul>
                    {questions.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {details.length > 0 && (
                <div className="material-group">
                  <h3>Material Details</h3>
                  <ul>
                    {details.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {pastPapers.length > 0 && (
                <div className="material-group">
                  <h3>Past Papers</h3>
                  <ul>
                    {pastPapers.map((p, i) => (
                      <li key={i} className="material-past-paper-row">
                        <span>
                          <a href={p.url} target="_blank" rel="noopener noreferrer">
                            {p.label}
                          </a>
                          {p.questions && <span className="material-past-paper-questions"> · {p.questions}</span>}
                        </span>
                        {p.markSchemeUrl && (
                          <a
                            href={p.markSchemeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="material-ms-pill"
                          >
                            Mark scheme
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <button type="button" className="secondary-btn" onClick={onUpdate}>
            Update Material
          </button>
          <button
            type="button"
            className="secondary-btn danger-hover-btn"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete Material
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          message="Are you sure you want to delete this material? This cannot be undone."
          confirmLabel="Delete Material"
          danger
          busy={deleting}
          error={deleteError}
          onCancel={() => {
            setConfirmingDelete(false);
            setDeleteError('');
          }}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
