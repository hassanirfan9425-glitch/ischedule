import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { countdownText, formatDate } from '../utils.js';
import { useOnlineStatus } from '../offline/connectivity.js';

// Mirrors server/src/routes/materials.js's STUDY_PLAN_COOLDOWN_MS — the server is the actual
// enforcement (this is just so the button can show a live countdown instead of only reacting
// after a rejected request comes back).
const COOLDOWN_MS = 60 * 1000;

// Back-button handling for this popup is owned by the parent Home page (see its combined
// useBackHandler call), matching every other popup in the app (MaterialPopup, ConfirmDialog, etc.)
// — none of them register their own handler.
//
// `plans` is the full bulk list already fetched by the Home page (one entry per exam that has a
// saved plan) — reused here directly instead of re-fetching per exam, so switching between exams
// in the picker is instant and every previously generated plan stays visible without ever being
// lost or overwritten by a different exam's plan.
export default function StudyPlanPopup({ exams, plans, onClose, onPlanUpdated, initialExamId, onSelectExam, onAddMaterial }) {
  const [selectedExamId, setSelectedExamId] = useState(initialExamId ?? exams[0]?.id ?? null);

  function selectExam(id) {
    setSelectedExamId(id);
    onSelectExam?.(id);
  }
  const [localPlans, setLocalPlans] = useState({});
  const [localGeneratedAt, setLocalGeneratedAt] = useState({});
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const isOnline = useOnlineStatus();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const selectedExam = exams.find((e) => e.id === selectedExamId) || null;
  const hasMaterial = Boolean(selectedExam?.material);
  const plannedExamIds = new Set(plans.map((p) => p.examId));
  const planRecord = plans.find((p) => p.examId === selectedExamId) || null;
  const savedPlan = planRecord?.plan || null;
  const plan = localPlans[selectedExamId] || savedPlan;

  const lastGeneratedMs =
    localGeneratedAt[selectedExamId] ?? (planRecord?.generatedAt ? new Date(planRecord.generatedAt).getTime() : null);
  const cooldownRemainingSec = lastGeneratedMs ? Math.max(0, Math.ceil((COOLDOWN_MS - (now - lastGeneratedMs)) / 1000)) : 0;

  async function handleGenerate() {
    if (!selectedExam) return;
    setGenerating(true);
    setError('');
    try {
      const data = await api.generateStudyPlan(selectedExam.id, selectedExam.daysUntil);
      setLocalPlans((prev) => ({ ...prev, [selectedExam.id]: data.plan }));
      setLocalGeneratedAt((prev) => ({ ...prev, [selectedExam.id]: Date.now() }));
      onPlanUpdated?.(selectedExam.id, selectedExam.subjectLabel, data.plan);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="confirm-backdrop" onClick={onClose}>
      <div className="material-popup study-plan-popup" onClick={(e) => e.stopPropagation()}>
        <div className="popup-close-sticky">
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="material-popup-header">
          <div className="material-popup-subject">Study Plan</div>
        </div>

        <div className="manual-subject-list study-plan-exam-list">
          {exams.map((exam) => (
            <button
              type="button"
              key={exam.id}
              className={
                exam.id === selectedExamId
                  ? 'manual-subject-row study-plan-exam-row active'
                  : 'manual-subject-row study-plan-exam-row'
              }
              onClick={() => selectExam(exam.id)}
            >
              <span>{exam.subjectLabel}</span>
              <span className="study-plan-exam-meta">
                {countdownText(exam.daysUntil)}
                {plannedExamIds.has(exam.id) ? ' · Planned' : ''}
                {exam.term != null && exam.weekNumber != null && (
                  <span className="study-plan-exam-week">T{exam.term} WK{exam.weekNumber}</span>
                )}
              </span>
            </button>
          ))}
        </div>

        {error && <p className="error-text">{error}</p>}

        {plan && plan.length > 0 && (
          <div className="study-plan-days">
            {plan.map((day, i) => (
              <div key={i} className="study-plan-day">
                <div className="study-plan-day-header">
                  <span className="study-plan-day-label">{formatDate(day.date)}</span>
                  <span className="study-plan-day-countdown">
                    {day.daysBeforeExam === 0 ? 'day before exam' : `${day.daysBeforeExam}d before exam`}
                  </span>
                </div>
                <div className="study-plan-day-focus">{day.focus}</div>
                <ul className="study-plan-day-tasks">
                  {day.tasks.map((t, j) => (
                    <li key={j}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {(!plan || plan.length === 0) && <p className="subtle">No study plan yet for this exam.</p>}

        {!hasMaterial && (
          <>
            <p className="subtle">Add material for this exam before generating a study plan.</p>
            <button type="button" className="secondary-btn" onClick={() => onAddMaterial?.(selectedExam)}>
              + Add Material
            </button>
          </>
        )}

        {hasMaterial && !isOnline && <p className="subtle">You're offline. Generating a study plan needs a connection.</p>}

        {hasMaterial && (
          <button
            type="button"
            className="primary-btn"
            onClick={handleGenerate}
            disabled={generating || cooldownRemainingSec > 0 || !isOnline}
          >
            {generating
              ? 'Generating…'
              : cooldownRemainingSec > 0
                ? `Wait ${cooldownRemainingSec}s…`
                : plan && plan.length > 0
                  ? 'Regenerate Plan'
                  : 'Generate Study Plan'}
          </button>
        )}
      </div>
    </div>
  );
}
