import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { api } from '../api.js';
import { countdownText, formatDate, APK_DOWNLOAD_URL } from '../utils.js';
import BrandIcon from '../components/BrandIcon.jsx';
import NavDrawer from '../components/NavDrawer.jsx';
import { QuizIcon, SwapIcon, TutorialIcon, SettingsIcon, DownloadIcon, LogoutIcon, TrashIcon } from '../components/NavIcons.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import StudyPlanPopup from '../components/StudyPlanPopup.jsx';
import ReflectionPopup from '../components/ReflectionPopup.jsx';
import DifficultyNudgePopup from '../components/DifficultyNudgePopup.jsx';
import AddChoiceDialog from '../components/AddChoiceDialog.jsx';
import MaterialUpload from './MaterialUpload.jsx';
import ManualMaterialEntry from './ManualMaterialEntry.jsx';
import TabBar from '../components/TabBar.jsx';
import { useBackHandler } from '../hooks/useBackButton.js';
import { useStreakAnimation } from '../hooks/useStreakAnimation.js';

export default function Home({
  user,
  greeting,
  onLogout,
  onRetakeQuiz,
  onEditElectives,
  onSettings,
  onRestartTutorial,
  onDeleteAccount,
  activeTab,
  onSwitchTab,
  forceDrawerOpen = false,
  drawerHighlightLabel = null,
}) {
  const [dashboardData, setDashboardData] = useState(null);
  const [academicsData, setAcademicsData] = useState(null);
  const [studyPlans, setStudyPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [viewingStudyPlan, setViewingStudyPlan] = useState(false);
  const [studyPlanExamId, setStudyPlanExamId] = useState(null);
  const [choosingMaterialForExam, setChoosingMaterialForExam] = useState(null);
  const [attachingMaterialExam, setAttachingMaterialExam] = useState(null);
  const [manualMaterialExam, setManualMaterialExam] = useState(null);
  const [pendingReflection, setPendingReflection] = useState(null);
  const [difficultyCatalog, setDifficultyCatalog] = useState([]);
  const [reflectingExam, setReflectingExam] = useState(null);
  const [activeNudge, setActiveNudge] = useState(null);

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

  // Merges a freshly generated/regenerated plan into local state immediately, so the Home preview
  // below updates without waiting for a full page reload.
  function handlePlanUpdated(examId, subjectLabel, plan) {
    setStudyPlans((prev) => [...prev.filter((p) => p.examId !== examId), { examId, subjectLabel, plan }]);
  }

  const handleMaterialComplete = async () => {
    setAttachingMaterialExam(null);
    setManualMaterialExam(null);
    const fresh = await api.getDashboard();
    setDashboardData(fresh);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await onDeleteAccount();
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  };

  useBackHandler(
    drawerOpen ||
      confirmingDelete ||
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
    if (viewingStudyPlan) {
      setViewingStudyPlan(false);
      return;
    }
    if (confirmingDelete) {
      setConfirmingDelete(false);
      setDeleteError('');
      return;
    }
    setDrawerOpen(false);
  });

  const navGroups = [
    {
      label: 'Preferences',
      items: [
        { label: 'Retake Quiz', icon: <QuizIcon />, onClick: onRetakeQuiz },
        { label: 'Change Externals', icon: <SwapIcon />, onClick: onEditElectives },
        { label: 'Restart Tutorial', icon: <TutorialIcon />, onClick: onRestartTutorial },
      ],
    },
    {
      label: 'App',
      items: [
        { label: 'Settings', icon: <SettingsIcon />, onClick: onSettings },
        // Pointless (and slightly odd) to offer downloading the app from inside the app itself.
        ...(Capacitor.isNativePlatform()
          ? []
          : [{ label: 'Download App', icon: <DownloadIcon />, onClick: () => window.open(APK_DOWNLOAD_URL, '_blank') }]),
      ],
    },
    {
      label: 'Account',
      items: [
        { label: 'Log Out', icon: <LogoutIcon />, onClick: onLogout },
        { label: 'Delete Account', icon: <TrashIcon />, danger: true, onClick: () => setConfirmingDelete(true) },
      ],
    },
  ];

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

  // Show every term that actually has grades, not just whichever term the schedule says is
  // "current" — that inference can be wrong (or there's no schedule at all yet), and a term with
  // real entries shouldn't just silently not show up here.
  const termsWithGrades = academicsData
    ? academicsData.terms.filter((t) => t.overallAverage !== null).sort((a, b) => a.term - b.term)
    : [];
  // Suggestions, unlike averages, only make sense for the most recent term — showing advice for
  // an old term next to the current one is just noise.
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

  // Placed after every hook call above (including useStreakAnimation) rather than earlier in the
  // function — an early return before a hook call makes React skip that hook on this render but
  // not others, which breaks React's "same hooks, same order, every render" rule and crashes the
  // whole tree with "Rendered fewer hooks than expected."
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
    <div className="dashboard">
      <button type="button" className="hamburger-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
        ☰
      </button>
      <NavDrawer
        open={drawerOpen || forceDrawerOpen}
        onClose={() => setDrawerOpen(false)}
        groups={navGroups}
        highlightLabel={drawerHighlightLabel}
      />

      <header className="dashboard-header" style={{ paddingLeft: 'calc(108px + env(safe-area-inset-left))' }}>
        <div className="brand" style={{ marginBottom: 0, justifyContent: 'flex-start' }}>
          <BrandIcon />
          <div>
            <div className="brand-name" style={{ fontSize: '1.1rem' }}>
              Home
            </div>
            <h1 style={{ fontSize: '1.4rem' }}>{greeting}</h1>
          </div>
        </div>
      </header>

      <TabBar activeTab={activeTab} onSwitchTab={onSwitchTab} />

      {loading && (
        <div className="centered-screen">
          <div className="spinner" />
        </div>
      )}

      {!loading && (
        <div className="bloom-home">
          <button
            type="button"
            className="bloom-hero"
            data-tutorial="schedule-block"
            onClick={() => onSwitchTab('schedule')}
          >
            <div className="bloom-lbl">Next up</div>
            {upcomingExams.length === 0 ? (
              <div className="bloom-empty">No upcoming exams yet. Tap to add your calendar.</div>
            ) : (
              <>
                <div className="bloom-big">
                  {upcomingExams[0].subjectLabel} &middot; {countdownText(upcomingExams[0].daysUntil)}
                </div>
                {upcomingExams.length > 1 && (
                  <div className="bloom-hero-sub">
                    {upcomingExams.slice(1).map((exam) => (
                      <span key={exam.id}>
                        {exam.subjectLabel} ({countdownText(exam.daysUntil)})
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </button>

          <div className="bloom-row2">
            <button
              type="button"
              className="bloom-card tonal"
              data-tutorial="academic-block"
              onClick={() => onSwitchTab('academics')}
            >
              <div className="bloom-lbl">Average</div>
              {termsWithGrades.length === 0 ? (
                <div className="bloom-big" style={{ fontSize: '0.95rem' }}>
                  No grades yet
                </div>
              ) : (
                termsWithGrades.map((t) => (
                  <div className="bloom-big" key={t.term}>
                    {Math.round(t.overallAverage)}%
                  </div>
                ))
              )}
            </button>

            <button
              type="button"
              className="bloom-card tonal"
              data-tutorial="academic-block"
              onClick={() => onSwitchTab('academics')}
            >
              <div className="bloom-lbl">Streak</div>
              <div className="bloom-big" style={{ fontSize: topStreakSubject ? '1.1rem' : '0.95rem' }}>
                {topStreakSubject ? (
                  <span
                    className={`${
                      topStreakSubject.amsStreakStatus === 'atRisk' ? 'streak-badge-atrisk' : ''
                    } ${topStreakAnim ? `streak-anim-${topStreakAnim.type}` : ''}`.trim()}
                  >
                    🔥 {topStreakSubject.amsStreak} weeks
                  </span>
                ) : (
                  'No streak yet'
                )}
              </div>
            </button>
          </div>

          {latestTermWithGrades && latestTermWithGrades.suggestions.length > 0 && (
            <div className="bloom-card surface" data-tutorial="suggestions-section">
              <div className="bloom-lbl">Suggestions</div>
              <ul className="bloom-suggestions-list">
                {latestTermWithGrades.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {planExams.length > 0 && (
            <button
              type="button"
              className="bloom-card tonal"
              data-tutorial="study-plan-block"
              onClick={() => setViewingStudyPlan(true)}
            >
              <div className="bloom-lbl">Study plan</div>
              {nextTask ? (
                <div className="bloom-big" style={{ fontSize: '0.95rem' }}>
                  {nextTask.subjectLabel}: {nextTask.focus} &middot; {formatDate(nextTask.date)}
                </div>
              ) : (
                <div className="bloom-empty">Tap to view or generate a day-by-day plan for any upcoming exam.</div>
              )}
            </button>
          )}

          {(pendingReflection?.examToReflect || pendingReflection?.nudge) && (
            <button
              type="button"
              className="bloom-card tonal"
              data-tutorial="reflection-block"
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
              <div className="bloom-lbl">Reflection</div>
              {pendingReflection.nudge?.autoApplied ? (
                <div className="bloom-big" style={{ fontSize: '0.95rem' }}>
                  {pendingReflection.nudge.subjectLabel} auto-adjusted to{' '}
                  {difficultyCatalog.find((d) => d.key === pendingReflection.nudge.newDifficulty)?.label ??
                    pendingReflection.nudge.newDifficulty}
                </div>
              ) : pendingReflection.nudge ? (
                <div className="bloom-big" style={{ fontSize: '0.95rem' }}>
                  Re-rate {pendingReflection.nudge.subjectLabel}?
                </div>
              ) : (
                <div className="bloom-big" style={{ fontSize: '0.95rem' }}>
                  How did {pendingReflection.examToReflect.subjectLabel}
                  {pendingReflection.examToReflect.weekNumber ? ` (Week ${pendingReflection.examToReflect.weekNumber})` : ''} go?
                </div>
              )}
            </button>
          )}
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          message="Are you sure you want to delete your account? This cannot be undone."
          confirmLabel="Delete Account"
          danger
          busy={deleting}
          error={deleteError}
          onCancel={() => {
            setConfirmingDelete(false);
            setDeleteError('');
          }}
          onConfirm={handleDeleteAccount}
        />
      )}

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
