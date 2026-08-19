import { useState } from 'react';
import { api } from '../api.js';

const CHOICES = [
  { rating: 'worse', label: 'Worse than expected' },
  { rating: 'expected', label: 'About as expected' },
  { rating: 'better', label: 'Better than expected' },
];

export default function ReflectionPopup({ exam, onClose, onSubmitted }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleChoose(rating) {
    setSubmitting(true);
    setError('');
    try {
      const data = await api.submitReflection(exam.examId, rating);
      onSubmitted(data);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="confirm-backdrop" onClick={onClose}>
      <div className="confirm-dialog reflection-dialog" onClick={(e) => e.stopPropagation()}>
        <p>
          How did {exam.subjectLabel}
          {exam.weekNumber ? ` (Week ${exam.weekNumber})` : ''} go?
        </p>
        {error && <p className="error-text">{error}</p>}
        <div className="confirm-actions reflection-dialog-actions">
          {CHOICES.map((choice) => (
            <button
              type="button"
              key={choice.rating}
              className="secondary-btn"
              onClick={() => handleChoose(choice.rating)}
              disabled={submitting}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <button type="button" className="back-link material-choice-cancel" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
      </div>
    </div>
  );
}
