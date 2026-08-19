import { useState } from 'react';
import { api } from '../api.js';
import CalendarIcon from '../components/CalendarIcon.jsx';

function splitLines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function ManualMaterialEntry({ exam, onComplete, onCancel }) {
  const [quizzesText, setQuizzesText] = useState('');
  const [questionsText, setQuestionsText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const quizzes = splitLines(quizzesText);
  const questions = splitLines(questionsText);
  const canSubmit = quizzes.length > 0 || questions.length > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) {
      setError('Type at least one course practice quiz or course question.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await api.addManualMaterial(exam.id, { quizzes, questions });
      await onComplete(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="centered-screen">
      <div className="upload-card">
        <button type="button" className="back-link" onClick={onCancel}>
          ← Back to dashboard
        </button>
        <div className="brand">
          <CalendarIcon />
          <span className="brand-name">iCalendar</span>
        </div>
        <h1>Enter material for {exam.subjectLabel}</h1>
        <p className="subtle">
          Type in the course practice quizzes and/or course questions. One item per line. You only
          need to fill in one of the two.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Course Practice (quizzes)
            <textarea
              rows={4}
              placeholder={'Chapter 1 Practice Quiz\nChapter 2 Practice Quiz'}
              value={quizzesText}
              onChange={(e) => setQuizzesText(e.target.value)}
            />
          </label>

          <label>
            Course Questions
            <textarea
              rows={4}
              placeholder={'Chapter 1: Questions 1, 5, 9, 12\nChapter 2: Questions 1, 3, 7'}
              value={questionsText}
              onChange={(e) => setQuestionsText(e.target.value)}
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="primary-btn" disabled={!canSubmit || submitting}>
            {submitting ? 'Saving…' : 'Save Material'}
          </button>
        </form>
      </div>
    </div>
  );
}
