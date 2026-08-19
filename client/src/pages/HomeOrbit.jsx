import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { countdownText, formatDate } from '../utils.js';
import OrbitDial from '../components/OrbitDial.jsx';
import StudyPlanPopup from '../components/StudyPlanPopup.jsx';
import ReflectionPopup from '../components/ReflectionPopup.jsx';
import DifficultyNudgePopup from '../components/DifficultyNudgePopup.jsx';
import AddChoiceDialog from '../components/AddChoiceDialog.jsx';
import MaterialUpload from './MaterialUpload.jsx';
import ManualMaterialEntry from './ManualMaterialEntry.jsx';
import { useBackHandler } from '../hooks/useBackButton.js';
import { useStreakAnimation } from '../hooks/useStreakAnimation.js';

export default function Home({ greeting, activeTab, onSwitchTab }) {
  const [dashboardData, setDashboardData] = useState(null);
  const [academicsData, setAcademicsData] = useState(null);
  const [studyPlans, setStudyPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingStudyPlan, setViewingStudyPlan] = useState(false);
  const [studyPlanExamId, setStudyPlanExamId] = useState(null);
  const [choosingMaterialForExam, setChoosingMaterialForExam] = useState(null);
  const [attachingMaterialExam, setAttachingMaterialExam] = useState(null);
  const [manualMaterialExam, setManualMaterialExam] = useState(null);
  const [pendingReflection, setPendingReflection] = useState(null);
  const [difficultyCatalog, setDifficultyCatalog] = useState([]);
  const [reflectingExam, setReflectingExam] = useState(null);
  const [activeNudge, setActiveNudge] = useState(null);

  useBackHandler(
    viewingStudyPlan ||
      !!reflectingExam ||
      !!activeNudge ||
      !!choosingMaterialForExam ||
      !!attachingMaterialExam ||
      !!manualMaterialExam,
    () => {
    if (attachingMaterialExam) {
      setAttachingMaterialExam(null);
      return;
    }
    if (manualMaterialExam) {
      setManualMaterialExam(null);
      return;
    }
    if (choosingMaterialForExam) {
      setChoosingMaterialForExam(null);
      return;
    }
    if (activeNudge) {
      setActiveNudge(null);
      return;
    }
    if (reflectingExam) {
      setReflectingExam(null);
      return;
    }
    setViewingStudyPlan(false);
  });

  const handleMaterialComplete = async () => {
    setAttachingMaterialExam(null);
    setManualMaterialExam(null);
    const fresh = await api.getDashboard();
    setDashboardData(fresh);
  };

  useEffect(() => {
    Promise.all([
      api.getDashboard(),
      api.getAcademics(),
      api.getAllStudyPlans(),
      api.getPendingReflection(),
      api.getSubjectCatalog(),
    ])
      .then(([dash, acad, plans, pending, catalog]) => {
        setDashboardData(dash);
        setAcademicsData(acad);
        setStudyPlans(plans.plans);
        setPendingReflection(pending);
        setDifficultyCatalog(catalog.difficulties);
      })
      .finally(() => setLoading(false));
  }, []);

  function handlePlanUpdated(examId, subjectLabel, plan) {
    setStudyPlans((prev) => [...prev.filter((p) => p.examId !== examId), { examId, subjectLabel, plan }]);
  }

  const upcomingExams = dashboardData
    ? [...dashboardData.periodicExams, ...dashboardData.finalExams]
        .sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0))
        .slice(0, 3)
    : [];

  // Every future periodic exam, not just this term's — a study plan should be pickable even for a
  // subject months away (it just starts closer to that exam's own date, not today). Finals are
  // excluded: they're school-wide rather than a single subject's own material to plan around.
  const planExams = (dashboardData?.allUpcomingExams || []).filter((e) => e.examType !== 'final');

  // The single closest not-yet-passed task across every saved plan, so the Home card can show a
  // live preview instead of a generic prompt.
  const nextTask = (() => {
    if (!dashboardData || studyPlans.length === 0) return null;
    let best = null;
    for (const p of studyPlans) {
      for (const day of p.plan) {
        if (day.date < dashboardData.today) continue;
        if (!best || day.date < best.date) best = { ...day, subjectLabel: p.subjectLabel };
      }
    }
    return best;
  })();

  const termsWithGrades = academicsData
    ? academicsData.terms.filter((t) => t.overallAverage !== null).sort((a, b) => a.term - b.term)
    : [];
  const latestTermWithGrades = termsWithGrades.length > 0 ? termsWithGrades[termsWithGrades.length - 1] : null;

  // Whichever subject currently has the longest AMS streak — folded into the existing Academics
  // card rather than a separate section, since it's just one more fact about the same term.
  const topStreakSubject = (latestTermWithGrades?.subjectAverages || []).reduce(
    (best, s) => (s.amsStreak > (best?.amsStreak || 0) ? s : best),
    null
  );
  // Home shows one badge for whichever subject is currently on top, not a fixed per-subject slot
  // like the Academics grid rows — so only the "just unlocked/recovered" pop makes sense here; a
  // dying streak just means a different subject (or none) becomes the new top pick.
  const streakAnimations = useStreakAnimation(latestTermWithGrades?.subjectAverages);
  const topStreakIdentity = topStreakSubject?.subjectKey || (topStreakSubject ? `label:${topStreakSubject.subjectLabel}` : null);
  const topStreakAnim = topStreakIdentity ? streakAnimations[topStreakIdentity] : null;

  if (attachingMaterialExam) {
    return (
      <MaterialUpload
        exam={attachingMaterialExam}
        onComplete={handleMaterialComplete}
        onCancel={() => setAttachingMaterialExam(null)}
      />
    );
  }

  if (manualMaterialExam) {
    return (
      <ManualMaterialEntry
        exam={manualMaterialExam}
        onComplete={handleMaterialComplete}
        onCancel={() => setManualMaterialExam(null)}
      />
    );
  }

  return (
    <div className="dashboard orbit-page">
      <OrbitDial activeTab={activeTab} onSwitchTab={onSwitchTab} />
      <div className="orbit-content">
        <header className="orbit-header">
          <div className="orbit-header-eyebrow">Home</div>
          <h1>{greeting}</h1>
        </header>

        {loading && (
          <div className="centered-screen">
            <div className="spinner" />
          </div>
        )}

        {!loading && (
          <>
            <button type="button" className="orbit-panel" onClick={() => onSwitchTab('schedule')}>
              <div className="orbit-panel-title">Calendar</div>
              {upcomingExams.length === 0 ? (
                <div className="orbit-panel-empty">No upcoming exams yet. Tap to add your calendar.</div>
              ) : (
                upcomingExams.map((exam) => (
                  <div className="orbit-line-row" key={exam.id}>
                    <span className="orbit-line-label">{exam.subjectLabel}</span>
                    <span className="orbit-line-value">{countdownText(exam.daysUntil)}</span>
                  </div>
                ))
              )}
            </button>

            <button type="button" className="orbit-panel" onClick={() => onSwitchTab('academics')}>
              <div className="orbit-panel-title">Academics</div>
              {termsWithGrades.length === 0 ? (
                <div className="orbit-panel-empty">No grades yet. Tap to add your grade report.</div>
              ) : (
                termsWithGrades.map((t) => (
                  <div className="orbit-line-row" key={t.term}>
                    <span className="orbit-line-label">Term {t.term} average</span>
                    <span className="orbit-line-value-group">
                      <span className="orbit-line-value orbit-line-value-big">{Math.round(t.overallAverage)}</span>
                      {topStreakSubject && latestTermWithGrades && t.term === latestTermWithGrades.term && (
                        <span
                          className={`streak-badge streak-badge-full ${
                            topStreakSubject.amsStreakStatus === 'atRisk' ? 'streak-badge-atrisk' : ''
                          } ${topStreakAnim ? `streak-anim-${topStreakAnim.type}` : ''}`.trim()}
                        >
                          🔥 {topStreakSubject.amsStreak}-week streak in {topStreakSubject.subjectLabel}
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </button>

            {latestTermWithGrades && latestTermWithGrades.suggestions.length > 0 && (
              <div className="orbit-panel">
                <div className="orbit-panel-title">Suggestions</div>
                <ul className="orbit-suggestions">
                  {latestTermWithGrades.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {planExams.length > 0 && (
              <button type="button" className="orbit-panel" onClick={() => setViewingStudyPlan(true)}>
                <div className="orbit-panel-title">Study Plan</div>
                {nextTask ? (
                  <div className="orbit-line-row">
                    <span className="orbit-line-label">
                      {nextTask.subjectLabel}: {nextTask.focus}
                    </span>
                    <span className="orbit-line-value">{formatDate(nextTask.date)}</span>
                  </div>
                ) : (
                  <div className="orbit-panel-empty">Tap to view or generate a day-by-day plan for any upcoming exam.</div>
                )}
              </button>
            )}

            {(pendingReflection?.examToReflect || pendingReflection?.nudge) && (
              <button
                type="button"
                className="orbit-panel"
                onClick={() => {
                  if (pendingReflection.nudge?.autoApplied) {
                    setPendingReflection((prev) => ({ ...prev, nudge: null }));
                  } else if (pendingReflection.nudge) {
                    setActiveNudge(pendingReflection.nudge);
                  } else {
                    setReflectingExam(pendingReflection.examToReflect);
                  }
                }}
              >
                <div className="orbit-panel-title">Reflection</div>
                {pendingReflection.nudge?.autoApplied ? (
                  <div className="orbit-line-row">
                    <span className="orbit-line-label">
                      {pendingReflection.nudge.subjectLabel} auto-adjusted to{' '}
                      {difficultyCatalog.find((d) => d.key === pendingReflection.nudge.newDifficulty)?.label ??
                        pendingReflection.nudge.newDifficulty}
                    </span>
                  </div>
                ) : pendingReflection.nudge ? (
                  <div className="orbit-line-row">
                    <span className="orbit-line-label">Re-rate {pendingReflection.nudge.subjectLabel}?</span>
                  </div>
                ) : (
                  <div className="orbit-line-row">
                    <span className="orbit-line-label">
                      How did {pendingReflection.examToReflect.subjectLabel}
                      {pendingReflection.examToReflect.weekNumber ? ` (Week ${pendingReflection.examToReflect.weekNumber})` : ''} go?
                    </span>
                  </div>
                )}
              </button>
            )}
          </>
        )}
      </div>

      {viewingStudyPlan && (
        <StudyPlanPopup
          exams={planExams}
          plans={studyPlans}
          onClose={() => setViewingStudyPlan(false)}
          onPlanUpdated={handlePlanUpdated}
          initialExamId={studyPlanExamId}
          onSelectExam={setStudyPlanExamId}
          onAddMaterial={(exam) => {
            setStudyPlanExamId(exam.id);
            setChoosingMaterialForExam(exam);
          }}
        />
      )}

      {choosingMaterialForExam && (
        <AddChoiceDialog
          message={`How would you like to add material for ${choosingMaterialForExam.subjectLabel}?`}
          onChooseAuto={() => {
            setAttachingMaterialExam(choosingMaterialForExam);
            setChoosingMaterialForExam(null);
          }}
          onChooseManual={() => {
            setManualMaterialExam(choosingMaterialForExam);
            setChoosingMaterialForExam(null);
          }}
          onCancel={() => setChoosingMaterialForExam(null)}
        />
      )}

      {reflectingExam && (
        <ReflectionPopup
          exam={reflectingExam}
          onClose={() => setReflectingExam(null)}
          onSubmitted={(data) => {
            setReflectingExam(null);
            setPendingReflection((prev) => ({ ...prev, examToReflect: null, nudge: data.nudge ?? prev?.nudge ?? null }));
            if (data.nudge && !data.nudge.autoApplied) setActiveNudge(data.nudge);
          }}
        />
      )}

      {activeNudge && (
        <DifficultyNudgePopup
          nudge={activeNudge}
          difficulties={difficultyCatalog}
          onClose={() => setActiveNudge(null)}
          onResolved={() => {
            setActiveNudge(null);
            setPendingReflection((prev) => ({ ...prev, nudge: null }));
          }}
        />
      )}
    </div>
  );
}
