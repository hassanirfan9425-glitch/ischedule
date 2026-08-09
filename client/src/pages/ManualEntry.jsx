import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const EXAM_TYPES = [
  { key: 'weekly', label: 'Periodic' },
  { key: 'final', label: 'Final' },
];

export default function ManualEntry({ onDone, onCancel }) {
  const [effectiveSubjects, setEffectiveSubjects] = useState([]);
  const [manualExams, setManualExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);

  const [selectedSubjectKey, setSelectedSubjectKey] = useState(null);
  const [examType, setExamType] = useState('weekly');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [catalog, mine, existing] = await Promise.all([
          api.getSubjectCatalog(),
          api.getMySubjects(),
          api.getManualExams(),
        ]);
        const ratedKeys = new Set(mine.subjects.map((s) => s.subject_key));
        const list = [
          ...catalog.coreSubjects,
          ...catalog.conditionalCoreSubjects.filter((s) => ratedKeys.has(s.key)),
          ...catalog.subjects.filter((s) => ratedKeys.has(s.key)),
          ...catalog.autoSubjects,
        ];
        setEffectiveSubjects(list);
        setManualExams(existing.exams);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const atLimit = manualExams.length >= 150;
  const isDuplicate = useMemo(
    () => manualExams.some((e) => e.subjectKey === selectedSubjectKey && e.date === date),
    [manualExams, selectedSubjectKey, date]
  );

  async function handleAdd() {
    if (!selectedSubjectKey || !date) {
      setError('Pick a subject and a date.');
      return;
    }
    if (isDuplicate) {
      setError('You already added an exam for that subject on that date.');
      return;
    }
    setError('');
    setAdding(true);
    try {
      const { id } = await api.addManualExam({
        subjectKey: selectedSubjectKey,
        examType,
        date,
        time: time || undefined,
        notes: notes || undefined,
      });
      const subject = effectiveSubjects.find((s) => s.key === selectedSubjectKey);
      setManualExams((prev) => [
        ...prev,
        { id, subjectKey: selectedSubjectKey, subjectLabel: subject?.label, examType, date, time, notes },
      ]);
      setDate('');
      setTime('');
      setNotes('');
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteManualExam(id);
      setManualExams((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDone() {
    setFinishing(true);
    setError('');
    try {
      await api.finishManualEntry();
      await onDone();
    } catch (err) {
      setError(err.message);
      setFinishing(false);
    }
  }

  if (loading) {
    return (
      <div className="centered-screen">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page-screen">
      <div className="quiz-card">
        {onCancel && (
          <button type="button" className="back-link" onClick={onCancel}>
            ← Back to dashboard
          </button>
        )}
        <h1>Enter your schedule manually</h1>
        <p className="subtle">
          Pick a subject below, add a date for each exam, and repeat for as many as you need. Press Done
          when you're finished.
        </p>

        <h2>Your subjects</h2>
        <div className="manual-subject-list">
          {effectiveSubjects.map((subject) => (
            <button
              type="button"
              key={subject.key}
              className={selectedSubjectKey === subject.key ? 'manual-subject-row active' : 'manual-subject-row'}
              onClick={() => setSelectedSubjectKey(subject.key)}
            >
              {subject.label}
            </button>
          ))}
        </div>

        {selectedSubjectKey && (
          <div className="manual-entry-form">
            <div className="difficulty-picker" style={{ padding: '10px 0' }}>
              {EXAM_TYPES.map((t) => (
                <button
                  type="button"
                  key={t.key}
                  className={examType === t.key ? 'weekday-btn active' : 'weekday-btn'}
                  onClick={() => setExamType(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <label>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Time (optional)
              <input type="text" placeholder="e.g. 12:00 - 12:45" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <label>
              Notes (optional)
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>

            <button
              type="button"
              className="secondary-btn"
              onClick={handleAdd}
              disabled={adding || atLimit || !date}
            >
              {atLimit ? "You've hit the entry limit" : adding ? 'Adding…' : 'Add Exam'}
            </button>
          </div>
        )}

        {manualExams.length > 0 && (
          <>
            <h2>Added so far ({manualExams.length})</h2>
            <div className="manual-added-list">
              {manualExams.map((e) => (
                <div key={e.id} className="manual-added-row">
                  <div>
                    <strong>{e.subjectLabel}</strong>
                    <span className="subtle"> · {e.examType} · {e.date}{e.time ? ` · ${e.time}` : ''}</span>
                  </div>
                  <button type="button" className="back-link" onClick={() => handleDelete(e.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {error && <p className="error-text">{error}</p>}

        <button type="button" className="primary-btn" onClick={handleDone} disabled={finishing}>
          {finishing ? 'Saving…' : 'Done'}
        </button>
      </div>
    </div>
  );
}
