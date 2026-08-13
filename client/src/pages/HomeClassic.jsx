import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { api } from '../api.js';
import { countdownText, APK_DOWNLOAD_URL } from '../utils.js';
import CalendarIcon from '../components/CalendarIcon.jsx';
import NavDrawer from '../components/NavDrawer.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import TabBar from '../components/TabBar.jsx';
import { useBackHandler } from '../hooks/useBackButton.js';

export default function Home({
  user,
  greeting,
  onLogout,
  onRetakeQuiz,
  onEditElectives,
  onSettings,
  onDeleteAccount,
  activeTab,
  onSwitchTab,
}) {
  const [dashboardData, setDashboardData] = useState(null);
  const [academicsData, setAcademicsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    Promise.all([api.getDashboard(), api.getAcademics()])
      .then(([dash, acad]) => {
        setDashboardData(dash);
        setAcademicsData(acad);
      })
      .finally(() => setLoading(false));
  }, []);

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

  useBackHandler(drawerOpen || confirmingDelete, () => {
    if (confirmingDelete) {
      setConfirmingDelete(false);
      setDeleteError('');
      return;
    }
    setDrawerOpen(false);
  });

  const navItems = [
    { label: 'Retake Quiz', onClick: onRetakeQuiz },
    { label: 'Change Externals', onClick: onEditElectives },
    { label: 'Settings', onClick: onSettings },
    { label: 'Log Out', onClick: onLogout },
    { label: 'Delete Account', onClick: () => setConfirmingDelete(true) },
    // Pointless (and slightly odd) to offer downloading the app from inside the app itself.
    ...(Capacitor.isNativePlatform()
      ? []
      : [{ label: 'Download App', onClick: () => window.open(APK_DOWNLOAD_URL, '_blank') }]),
  ];

  const upcomingExams = dashboardData
    ? [...dashboardData.periodicExams, ...dashboardData.finalExams]
        .sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0))
        .slice(0, 3)
    : [];

  // Show every term that actually has grades, not just whichever term the schedule says is
  // "current" — that inference can be wrong (or there's no schedule at all yet), and a term with
  // real entries shouldn't just silently not show up here.
  const termsWithGrades = academicsData
    ? academicsData.terms.filter((t) => t.overallAverage !== null).sort((a, b) => a.term - b.term)
    : [];
  // Suggestions, unlike averages, only make sense for the most recent term — showing advice for
  // an old term next to the current one is just noise.
  const latestTermWithGrades = termsWithGrades.length > 0 ? termsWithGrades[termsWithGrades.length - 1] : null;

  return (
    <div className="dashboard">
      <button type="button" className="hamburger-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
        ☰
      </button>
      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} items={navItems} />

      <header className="dashboard-header" style={{ paddingLeft: 'calc(108px + env(safe-area-inset-left))' }}>
        <div className="brand" style={{ marginBottom: 0, justifyContent: 'flex-start' }}>
          <CalendarIcon />
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
        <>
          <button type="button" className="preview-card" onClick={() => onSwitchTab('schedule')}>
            <div className="preview-card-title">Schedule</div>
            {upcomingExams.length === 0 ? (
              <div className="preview-card-empty">No upcoming exams yet. Tap to add your schedule.</div>
            ) : (
              upcomingExams.map((exam) => (
                <div className="preview-exam-row" key={exam.id}>
                  <span className="preview-exam-subject">{exam.subjectLabel}</span>
                  <span className="preview-exam-days">{countdownText(exam.daysUntil)}</span>
                </div>
              ))
            )}
          </button>

          <button type="button" className="preview-card" onClick={() => onSwitchTab('academics')}>
            <div className="preview-card-title">Academics</div>
            {termsWithGrades.length === 0 ? (
              <div className="preview-card-empty">No grades yet. Tap to add your grade report.</div>
            ) : (
              <div className="preview-average-list">
                {termsWithGrades.map((t) => (
                  <div className="preview-average" key={t.term}>
                    <span className="preview-average-value">{Math.round(t.overallAverage)}</span>
                    <span className="preview-average-label">Term {t.term} average</span>
                  </div>
                ))}
              </div>
            )}
          </button>

          {latestTermWithGrades && latestTermWithGrades.suggestions.length > 0 && (
            <div className="suggestions-section">
              <div className="preview-card-title">Suggestions</div>
              <ul>
                {latestTermWithGrades.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </>
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
    </div>
  );
}
