import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { countdownText } from '../utils.js';
import CalendarIcon from '../components/CalendarIcon.jsx';
import NavDrawer from '../components/NavDrawer.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import TabBar from '../components/TabBar.jsx';

export default function Home({
  user,
  onLogout,
  onReupload,
  onRetakeQuiz,
  onSettings,
  onManualEntry,
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
  const [confirmingDeleteSchedule, setConfirmingDeleteSchedule] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState(false);
  const [deleteScheduleError, setDeleteScheduleError] = useState('');
  const [confirmingDeleteGrades, setConfirmingDeleteGrades] = useState(false);
  const [deletingGrades, setDeletingGrades] = useState(false);
  const [deleteGradesError, setDeleteGradesError] = useState('');

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

  const handleDeleteSchedule = async () => {
    setDeletingSchedule(true);
    setDeleteScheduleError('');
    try {
      await api.deleteSchedule();
      const fresh = await api.getDashboard();
      setDashboardData(fresh);
      setConfirmingDeleteSchedule(false);
    } catch (err) {
      setDeleteScheduleError(err.message);
    } finally {
      setDeletingSchedule(false);
    }
  };

  const handleDeleteAllGrades = async () => {
    setDeletingGrades(true);
    setDeleteGradesError('');
    try {
      await api.deleteAllGrades();
      const fresh = await api.getAcademics();
      setAcademicsData(fresh);
      setConfirmingDeleteGrades(false);
    } catch (err) {
      setDeleteGradesError(err.message);
    } finally {
      setDeletingGrades(false);
    }
  };

  const navItems = [
    { label: 'Retake Quiz', onClick: onRetakeQuiz },
    { label: 'Update Schedule', onClick: onReupload },
    { label: 'Enter Schedule Manually', onClick: onManualEntry },
    { label: 'Settings', onClick: onSettings },
    { label: 'Delete Schedule', onClick: () => setConfirmingDeleteSchedule(true) },
    { label: 'Delete All Grades', onClick: () => setConfirmingDeleteGrades(true) },
    { label: 'Log Out', onClick: onLogout },
    { label: 'Delete Account', onClick: () => setConfirmingDelete(true) },
  ];

  const upcomingExams = dashboardData
    ? [...dashboardData.periodicExams, ...dashboardData.finalExams]
        .sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0))
        .slice(0, 3)
    : [];

  const currentTermData = academicsData
    ? academicsData.terms.find((t) => t.term === academicsData.currentTerm)
    : null;

  return (
    <div className="dashboard">
      <button type="button" className="hamburger-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
        ☰
      </button>
      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} items={navItems} />

      <header className="dashboard-header" style={{ paddingLeft: 76 }}>
        <div className="brand" style={{ marginBottom: 0, justifyContent: 'flex-start' }}>
          <CalendarIcon />
          <div>
            <div className="brand-name" style={{ fontSize: '1.1rem' }}>
              SabisHub
            </div>
            <h1 style={{ fontSize: '1.4rem' }}>Hey {user.name}</h1>
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
              <div className="preview-card-empty">No upcoming exams yet — tap to add your schedule.</div>
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
            {!currentTermData || currentTermData.overallAverage === null ? (
              <div className="preview-card-empty">No grades yet — tap to add your grade report.</div>
            ) : (
              <div className="preview-average">
                <span className="preview-average-value">{Math.round(currentTermData.overallAverage)}</span>
                <span className="preview-average-label">Term {currentTermData.term} average</span>
              </div>
            )}
          </button>

          {currentTermData && currentTermData.suggestions.length > 0 && (
            <div className="suggestions-section">
              <div className="preview-card-title">Suggestions</div>
              <ul>
                {currentTermData.suggestions.map((s, i) => (
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

      {confirmingDeleteSchedule && (
        <ConfirmDialog
          message="Are you sure you want to delete your entire schedule? This removes every exam and holiday, including manually-entered ones. This cannot be undone."
          confirmLabel="Delete Schedule"
          danger
          busy={deletingSchedule}
          error={deleteScheduleError}
          onCancel={() => {
            setConfirmingDeleteSchedule(false);
            setDeleteScheduleError('');
          }}
          onConfirm={handleDeleteSchedule}
        />
      )}

      {confirmingDeleteGrades && (
        <ConfirmDialog
          message="Are you sure you want to delete all your grades? This removes every entry across every term. This cannot be undone."
          confirmLabel="Delete All Grades"
          danger
          busy={deletingGrades}
          error={deleteGradesError}
          onCancel={() => {
            setConfirmingDeleteGrades(false);
            setDeleteGradesError('');
          }}
          onConfirm={handleDeleteAllGrades}
        />
      )}
    </div>
  );
}
