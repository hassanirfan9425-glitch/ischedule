import { useEffect, useState } from 'react';
import { api } from '../api.js';
import CalendarIcon from '../components/CalendarIcon.jsx';

function appliesToIdentity(subject, identity) {
  return Object.entries(subject.appliesWhen).every(([k, v]) => identity[k] === v);
}

function IdentityQuestion({ question, value, onChange }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontWeight: 700, marginBottom: 8 }}>{question}</p>
      <div className="tab-switch" style={{ margin: 0, maxWidth: 240 }}>
        <button type="button" className={value === true ? 'tab active' : 'tab'} onClick={() => onChange(true)}>
          Yes
        </button>
        <button type="button" className={value === false ? 'tab active' : 'tab'} onClick={() => onChange(false)}>
          No
        </button>
      </div>
    </div>
  );
}

function WeekdayQuestion({ weekdays, value, onChange }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontWeight: 700, marginBottom: 8 }}>What day do your periodic exams happen?</p>
      <div className="difficulty-picker" style={{ padding: 0 }}>
        {weekdays.map((w) => (
          <button
            type="button"
            key={w.key}
            className={value === w.key ? 'weekday-btn active' : 'weekday-btn'}
            onClick={() => onChange(w.key)}
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const QUIZ_TUTORIAL_COPY = {
  core: 'These are your required subjects. Rate how difficult each one is for you.',
  electives:
    "These are extra subjects you might be taking. If any apply to you, select them and rate their difficulty. Otherwise, just press Next below to continue.",
};

export default function Quiz({ onComplete, retake, tutorialActive, onSkipTutorial }) {
  const [coreSubjects, setCoreSubjects] = useState([]);
  const [conditionalCoreSubjects, setConditionalCoreSubjects] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [difficulties, setDifficulties] = useState([]);
  const [weekdays, setWeekdays] = useState([]);
  const [identity, setIdentity] = useState({ arab: null, muslim: null });
  const [periodicDay, setPeriodicDay] = useState(null);
  const [coreDifficulty, setCoreDifficulty] = useState({}); // subjectKey -> difficultyKey
  const [selections, setSelections] = useState({}); // subjectKey -> difficultyKey | null
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Core subjects (+ identity/periodic-day questions) come first, then the optional externals —
  // one screen at a time instead of one long scroll.
  const [step, setStep] = useState('core');

  useEffect(() => {
    async function load() {
      try {
        const catalog = await api.getSubjectCatalog();
        setCoreSubjects(catalog.coreSubjects);
        setConditionalCoreSubjects(catalog.conditionalCoreSubjects);
        setSubjects(catalog.subjects);
        setDifficulties(catalog.difficulties);
        setWeekdays(catalog.weekdays);

        if (retake) {
          const mine = await api.getMySubjects();
          const byKey = Object.fromEntries(mine.subjects.map((s) => [s.subject_key, s.difficulty]));
          const keysSet = new Set(Object.keys(byKey));

          const matchedConditional = catalog.conditionalCoreSubjects.find((s) => keysSet.has(s.key));
          setIdentity(
            matchedConditional
              ? {
                  arab: matchedConditional.appliesWhen.arab ?? false,
                  muslim: matchedConditional.appliesWhen.muslim ?? false,
                }
              : { arab: false, muslim: false }
          );

          setPeriodicDay(mine.periodicDay || null);

          const coreDiff = {};
          for (const s of [...catalog.coreSubjects, ...catalog.conditionalCoreSubjects]) {
            if (byKey[s.key]) coreDiff[s.key] = byKey[s.key];
          }
          setCoreDifficulty(coreDiff);

          const electiveSel = {};
          for (const s of catalog.subjects) {
            if (byKey[s.key]) electiveSel[s.key] = byKey[s.key];
          }
          setSelections(electiveSel);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [retake]);

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

  const identityAnswered = identity.arab !== null && identity.muslim !== null;
  const readyForSubjects = identityAnswered && periodicDay !== null;
  const applicableConditional = identityAnswered
    ? conditionalCoreSubjects.filter((s) => appliesToIdentity(s, identity))
    : [];
  const allCoreSubjects = [...coreSubjects, ...applicableConditional];

  const selectedKeys = Object.keys(selections);
  const missingElectiveDifficulty = selectedKeys.some((k) => !selections[k]);
  const missingCoreDifficulty = allCoreSubjects.some((s) => !coreDifficulty[s.key]);

  const showTutorialCard = tutorialActive && (step === 'electives' || (step === 'core' && readyForSubjects));

  function handleNext() {
    if (missingCoreDifficulty) {
      setError('Rate every core subject before continuing.');
      return;
    }
    setError('');
    setStep('electives');
  }

  async function handleSubmit() {
    if (missingElectiveDifficulty) {
      setError('Pick a difficulty for every subject you selected.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const corePayload = allCoreSubjects.map((s) => ({
        subjectKey: s.key,
        difficulty: coreDifficulty[s.key],
      }));
      const electivePayload = selectedKeys.map((subjectKey) => ({
        subjectKey,
        difficulty: selections[subjectKey],
      }));
      await api.saveMySubjects([...corePayload, ...electivePayload], periodicDay);
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
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
      {showTutorialCard && (
        <div className="tutorial-companion">
          <p>{QUIZ_TUTORIAL_COPY[step]}</p>
          <button type="button" className="back-link tutorial-skip-link" onClick={onSkipTutorial}>
            Skip tutorial
          </button>
        </div>
      )}
      <div className="quiz-card">
        {retake && step === 'core' && (
          <button type="button" className="back-link" onClick={onComplete}>
            ← Back to dashboard
          </button>
        )}
        <div className="brand">
          <CalendarIcon />
          <span className="brand-name">Study Compass</span>
        </div>

        {step === 'core' && (
          <>
            <h1>A couple quick things first</h1>
            <p className="subtle">This helps us ask about the right subjects for you.</p>

            <IdentityQuestion
              question="Are you Arab?"
              value={identity.arab}
              onChange={(arab) => setIdentity((prev) => ({ ...prev, arab }))}
            />
            <IdentityQuestion
              question="Are you Muslim?"
              value={identity.muslim}
              onChange={(muslim) => setIdentity((prev) => ({ ...prev, muslim }))}
            />
            <WeekdayQuestion weekdays={weekdays} value={periodicDay} onChange={setPeriodicDay} />

            {readyForSubjects && (
              <>
                <h1 style={{ marginTop: 32 }}>How's it going in each subject?</h1>
                <p className="subtle">Everyone takes these. Rate how each one feels for you.</p>

                <div className="subject-group">
                  <div className="subject-list">
                    {allCoreSubjects.map((subject) => (
                      <div key={subject.key} className="subject-row selected">
                        <div className="subject-chip" style={{ cursor: 'default' }}>
                          {subject.label}
                        </div>
                        <div className="difficulty-picker">
                          {difficulties.map((d) => (
                            <button
                              type="button"
                              key={d.key}
                              className={
                                coreDifficulty[subject.key] === d.key
                                  ? `difficulty-btn ${d.key} active`
                                  : `difficulty-btn ${d.key}`
                              }
                              onClick={() => setCoreDifficulty((prev) => ({ ...prev, [subject.key]: d.key }))}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {error && <p className="error-text">{error}</p>}

                <button type="button" className="primary-btn" onClick={handleNext}>
                  Next
                </button>
              </>
            )}
          </>
        )}

        {step === 'electives' && (
          <>
            <button type="button" className="back-link" onClick={() => setStep('core')}>
              ← Back
            </button>

            <h1 style={{ marginTop: 16 }}>Anything else?</h1>
            <p className="subtle">
              Select any extra courses you take (none are required). For each one you pick, tell us how it
              feels for you.
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
                          <button
                            type="button"
                            className="subject-chip"
                            onClick={() => toggleSubject(subject.key)}
                          >
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
              {submitting ? 'Saving…' : retake ? 'Save changes' : 'Continue'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
