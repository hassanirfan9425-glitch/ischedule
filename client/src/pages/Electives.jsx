import { useEffect, useState } from 'react';
import { api } from '../api.js';
import BrandIcon from '../components/BrandIcon.jsx';

// Lets a student change which extra (non-core) subjects they take at any time, without touching
// their core subject ratings, identity answers, or periodic day — those stay exactly as they are.
export default function Electives({ onDone, onCancel }) {
  const [subjects, setSubjects] = useState([]);
  const [difficulties, setDifficulties] = useState([]);
  const [keptPayload, setKeptPayload] = useState([]); // core + conditional-core, unchanged
  const [periodicDay, setPeriodicDay] = useState(null);
  const [selections, setSelections] = useState({}); // subjectKey -> difficultyKey | null
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [catalog, mine] = await Promise.all([api.getSubjectCatalog(), api.getMySubjects()]);
        setSubjects(catalog.subjects);
        setDifficulties(catalog.difficulties);
        setPeriodicDay(mine.periodicDay || null);

        const electiveKeys = new Set(catalog.subjects.map((s) => s.key));
        const kept = [];
        const electiveSel = {};
        for (const s of mine.subjects) {
          if (electiveKeys.has(s.subject_key)) {
            electiveSel[s.subject_key] = s.difficulty;
          } else {
            kept.push({ subjectKey: s.subject_key, difficulty: s.difficulty });
          }
        }
        setKeptPayload(kept);
        setSelections(electiveSel);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleSubject(key) {
    setSelections((prev) => {
      const next = { ...prev };
      if (key in next) {
        delete next[key];
      } else {
        next[key] = null;
      }
      return next;
    });
  }

  function setDifficulty(key, difficulty) {
    setSelections((prev) => ({ ...prev, [key]: difficulty }));
  }

  const selectedKeys = Object.keys(selections);
  const missingDifficulty = selectedKeys.some((k) => !selections[k]);

  async function handleSubmit() {
    if (missingDifficulty) {
      setError('Pick a difficulty for every subject you selected.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const electivePayload = selectedKeys.map((subjectKey) => ({
        subjectKey,
        difficulty: selections[subjectKey],
      }));
      await api.saveMySubjects([...keptPayload, ...electivePayload], periodicDay);
      onDone();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="centered-screen">
        <div className="spinner" />
      </div>
    );
  }

  const categories = [...new Set(subjects.map((s) => s.category))];

  return (
    <div className="page-screen">
      <div className="quiz-card">
        <button type="button" className="back-link" onClick={onCancel}>
          ← Back to dashboard
        </button>
        <div className="brand">
          <BrandIcon />
          <span className="brand-name">Cram</span>
        </div>

        <h1>Your externals</h1>
        <p className="subtle">
          Select any extra courses you take (none are required). For each one you pick, tell us how it
          feels for you. Your core subjects aren't affected here.
        </p>

        {categories.map((category) => (
          <div key={category} className="subject-group">
            <h2>{category}</h2>
            <div className="subject-list">
              {subjects
                .filter((s) => s.category === category)
                .map((subject) => {
                  const isSelected = subject.key in selections;
                  return (
                    <div key={subject.key} className={isSelected ? 'subject-row selected' : 'subject-row'}>
                      <button type="button" className="subject-chip" onClick={() => toggleSubject(subject.key)}>
                        <span className="checkbox">{isSelected ? '✓' : ''}</span>
                        {subject.label}
                      </button>

                      {isSelected && (
                        <div className="difficulty-picker">
                          {difficulties.map((d) => (
                            <button
                              type="button"
                              key={d.key}
                              className={
                                selections[subject.key] === d.key
                                  ? `difficulty-btn ${d.key} active`
                                  : `difficulty-btn ${d.key}`
                              }
                              onClick={() => setDifficulty(subject.key, d.key)}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}

        {error && <p className="error-text">{error}</p>}

        <button type="button" className="primary-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
