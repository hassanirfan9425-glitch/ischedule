import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { api } from '../api.js';
import { countdownText, APK_DOWNLOAD_URL } from '../utils.js';
import ExamBubble from '../components/ExamBubbleClassic.jsx';
import HolidayBubble from '../components/HolidayBubbleClassic.jsx';
import NavDrawer from '../components/NavDrawer.jsx';
import { QuizIcon, SwapIcon, SettingsIcon, DownloadIcon, LogoutIcon, TrashIcon } from '../components/NavIcons.jsx';
import BrandIcon from '../components/BrandIcon.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import MaterialPopup from '../components/MaterialPopup.jsx';
import AddChoiceDialog from '../components/AddChoiceDialog.jsx';
import MaterialUpload from './MaterialUpload.jsx';
import ManualMaterialEntry from './ManualMaterialEntry.jsx';
import TabBar from '../components/TabBar.jsx';
import { useBackHandler } from '../hooks/useBackButton.js';

function EmptyState({ title, hint }) {
  return (
    <div className="empty-state">
      <BrandIcon size={22} />
      <div>
        <div className="empty-state-title">{title}</div>
        {hint && <div className="empty-state-hint">{hint}</div>}
      </div>
    </div>
  );
}

function ExamSection({ title, emptyTitle, emptyHint, exams, onExamClick }) {
  return (
    <section>
      <h2 className="schedule-section-title">{title}</h2>
      {exams.length === 0 ? (
        <EmptyState title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="bubble-grid exams">
          {exams.map((exam) => (
            <ExamBubble key={exam.id} exam={exam} onClick={onExamClick} />
          ))}
        </div>
      )}
    </section>
  );
}

function AllExamsSection({ exams, onExamClick, onBack }) {
  return (
    <section>
      <button type="button" className="back-link" onClick={onBack}>
        ← Back to dashboard
      </button>
      <h2 className="schedule-section-title">All Upcoming Exams</h2>
      {exams.length === 0 ? (
        <EmptyState
          title="Nothing on the horizon"
          hint="Upload your calendar or add exams manually to see them here."
        />
      ) : (
        <div className="bubble-grid exams">
          {exams.map((exam) => (
            <ExamBubble key={exam.id} exam={exam} onClick={onExamClick} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Dashboard({
  greeting,
  onLogout,
  onReupload,
  onRetakeQuiz,
  onEditElectives,
  onSettings,
  onManualEntry,
  onDeleteAccount,
  activeTab,
  onSwitchTab,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [confirmingDeleteSchedule, setConfirmingDeleteSchedule] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState(false);
  const [deleteScheduleError, setDeleteScheduleError] = useState('');
  const [confirmingDeleteFinalSchedule, setConfirmingDeleteFinalSchedule] = useState(false);
  const [deletingFinalSchedule, setDeletingFinalSchedule] = useState(false);
  const [deleteFinalScheduleError, setDeleteFinalScheduleError] = useState('');
  const [choosingMaterialExam, setChoosingMaterialExam] = useState(null);
  const [attachingMaterialExam, setAttachingMaterialExam] = useState(null);
  const [manualMaterialExam, setManualMaterialExam] = useState(null);
  const [viewingMaterialExam, setViewingMaterialExam] = useState(null);
  const [viewingAllExams, setViewingAllExams] = useState(false);
  const [choosingScheduleAdd, setChoosingScheduleAdd] = useState(false);

  useEffect(() => {
    api
      .getDashboard()
      .then(setData)
      .catch((err) => setError(err.message))
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
      setData(fresh);
      setConfirmingDeleteSchedule(false);
    } catch (err) {
      setDeleteScheduleError(err.message);
    } finally {
      setDeletingSchedule(false);
    }
  };

  const handleDeleteFinalSchedule = async () => {
    setDeletingFinalSchedule(true);
    setDeleteFinalScheduleError('');
    try {
      await api.deleteFinalSchedule();
      const fresh = await api.getDashboard();
      setData(fresh);
      setConfirmingDeleteFinalSchedule(false);
    } catch (err) {
      setDeleteFinalScheduleError(err.message);
    } finally {
      setDeletingFinalSchedule(false);
    }
  };

  const handleExamClick = (exam) => {
    if (exam.material) {
      setViewingMaterialExam(exam);
    } else {
      setChoosingMaterialExam(exam);
    }
  };

  const handleMaterialComplete = async () => {
    setAttachingMaterialExam(null);
    setManualMaterialExam(null);
    setLoading(true);
    try {
      const fresh = await api.getDashboard();
      setData(fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMaterial = async (examId) => {
    await api.deleteMaterial(examId);
    setViewingMaterialExam(null);
    const fresh = await api.getDashboard();
    setData(fresh);
  };

  useBackHandler(
    Boolean(
      attachingMaterialExam ||
        manualMaterialExam ||
        confirmingDelete ||
        confirmingDeleteSchedule ||
        confirmingDeleteFinalSchedule ||
        viewingMaterialExam ||
        choosingMaterialExam ||
        choosingScheduleAdd ||
        viewingAllExams ||
        drawerOpen
    ),
    () => {
      if (attachingMaterialExam) {
        setAttachingMaterialExam(null);
        return;
      }
      if (manualMaterialExam) {
        setManualMaterialExam(null);
        return;
      }
      if (confirmingDelete) {
        setConfirmingDelete(false);
        setDeleteError('');
        return;
      }
      if (confirmingDeleteSchedule) {
        setConfirmingDeleteSchedule(false);
        setDeleteScheduleError('');
        return;
      }
      if (confirmingDeleteFinalSchedule) {
        setConfirmingDeleteFinalSchedule(false);
        setDeleteFinalScheduleError('');
        return;
      }
      if (viewingMaterialExam) {
        setViewingMaterialExam(null);
        return;
      }
      if (choosingMaterialExam) {
        setChoosingMaterialExam(null);
        return;
      }
      if (choosingScheduleAdd) {
        setChoosingScheduleAdd(false);
        return;
      }
      if (viewingAllExams) {
        setViewingAllExams(false);
        return;
      }
      setDrawerOpen(false);
    }
  );

  const hasAnyScheduleData =
    data && (data.periodicExams.length > 0 || data.finalExams.length > 0 || data.holidays.length > 0);

  const allUpcoming = data ? [...data.periodicExams, ...data.finalExams] : [];
  const nextExam = allUpcoming.reduce((closest, exam) => {
    if (exam.daysUntil === null) return closest;
    if (!closest || exam.daysUntil < closest.daysUntil) return exam;
    return closest;
  }, null);

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

  // Add more entries here any time — the drawer just renders whatever's in this list.
  const navGroups = [
    {
      label: 'Preferences',
      items: [
        { label: 'Retake Quiz', icon: <QuizIcon />, onClick: onRetakeQuiz },
        { label: 'Change Externals', icon: <SwapIcon />, onClick: onEditElectives },
      ],
    },
    {
      label: 'App',
      items: [
        { label: 'Settings', icon: <SettingsIcon />, onClick: onSettings },
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

  return (
    <div className="dashboard">
      <button
        type="button"
        className="hamburger-btn"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
      >
        ☰
      </button>
      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} groups={navGroups} />

      <header className="dashboard-header" style={{ paddingLeft: 'calc(108px + env(safe-area-inset-left))' }}>
        <div className="brand" style={{ marginBottom: 0, justifyContent: 'flex-start' }}>
          <BrandIcon />
          <div>
            <div className="brand-name" style={{ fontSize: '1.1rem' }}>
              Cram
            </div>
            <h1 style={{ fontSize: '1.4rem' }}>{greeting}</h1>
          </div>
        </div>
      </header>

      <TabBar activeTab={activeTab} onSwitchTab={onSwitchTab} onOpenMenu={() => setDrawerOpen(true)} />

      {loading && (
        <div className="centered-screen">
          <div className="spinner" />
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {data && !hasAnyScheduleData && (
        <div className="empty-landing">
          <div
            className="plus-button"
            data-tutorial="schedule-add"
            onClick={() => setChoosingScheduleAdd(true)}
            role="button"
            tabIndex={0}
          >
            +
          </div>
          <div className="empty-landing-title">Add your school calendar</div>
          <p className="empty-landing-hint">
            Upload a PDF or image of your exam &amp; holiday calendar, or enter it manually, to
            build your dashboard.
          </p>
        </div>
      )}

      {data && hasAnyScheduleData && (
        <>
          {allUpcoming.length > 0 && (
            <div className="stats-strip">
              <div className="stat-chip">
                <span className="stat-value">{allUpcoming.length}</span>
                <span className="stat-label">
                  upcoming exam{allUpcoming.length === 1 ? '' : 's'}
                </span>
              </div>
              {nextExam && (
                <div className="stat-chip stat-chip-highlight">
                  <span className="stat-label">Next up</span>
                  <span className="stat-value-inline">
                    {nextExam.subjectLabel} · {countdownText(nextExam.daysUntil)}
                  </span>
                </div>
              )}
              <button type="button" className="see-all-btn" onClick={() => setViewingAllExams(true)}>
                See all exams →
              </button>
            </div>
          )}

          {viewingAllExams ? (
            <AllExamsSection
              exams={data.allUpcomingExams}
              onExamClick={handleExamClick}
              onBack={() => setViewingAllExams(false)}
            />
          ) : (
            <>
              <ExamSection
                title="Periodic Exams"
                emptyTitle="Nothing on the horizon"
                emptyHint="Upload your calendar or add exams manually to see them here."
                exams={data.periodicExams}
                onExamClick={handleExamClick}
              />
              <ExamSection
                title="Final Exams"
                emptyTitle="No finals scheduled yet"
                emptyHint="They'll show up here once your calendar includes them."
                exams={data.finalExams}
                onExamClick={handleExamClick}
              />
              {data.finalExams.length > 0 && (
                <button
                  type="button"
                  className="secondary-btn danger-hover-btn schedule-delete-btn"
                  onClick={() => setConfirmingDeleteFinalSchedule(true)}
                >
                  Delete Final Calendar
                </button>
              )}

              <section>
                <h2 className="schedule-section-title">Upcoming Holidays</h2>
                {data.holidays.length === 0 ? (
                  <EmptyState
                    title="No holidays coming up"
                    hint="Check back after your next calendar update."
                  />
                ) : (
                  <div className="bubble-grid holidays">
                    {data.holidays.map((holiday) => (
                      <HolidayBubble key={holiday.id} holiday={holiday} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      {hasAnyScheduleData && (
        <button
          type="button"
          className="secondary-btn danger-hover-btn schedule-delete-btn"
          onClick={() => setConfirmingDeleteSchedule(true)}
        >
          Delete Calendar
        </button>
      )}

      {hasAnyScheduleData && (
        <button
          type="button"
          className="fab-btn"
          data-tutorial="schedule-add"
          onClick={() => setChoosingScheduleAdd(true)}
          title="Update your calendar"
        >
          +
        </button>
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
          message="Are you sure you want to delete your entire calendar? This removes every exam and holiday, including manually-entered ones. This cannot be undone."
          confirmLabel="Delete Calendar"
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

      {confirmingDeleteFinalSchedule && (
        <ConfirmDialog
          message="Are you sure you want to delete your final exam calendar? This removes every final exam entry. Periodic exams and holidays are not affected. This cannot be undone."
          confirmLabel="Delete Final Calendar"
          danger
          busy={deletingFinalSchedule}
          error={deleteFinalScheduleError}
          onCancel={() => {
            setConfirmingDeleteFinalSchedule(false);
            setDeleteFinalScheduleError('');
          }}
          onConfirm={handleDeleteFinalSchedule}
        />
      )}

      {viewingMaterialExam && (
        <MaterialPopup
          exam={viewingMaterialExam}
          onClose={() => setViewingMaterialExam(null)}
          onUpdate={() => {
            setChoosingMaterialExam(viewingMaterialExam);
            setViewingMaterialExam(null);
          }}
          onDelete={() => handleDeleteMaterial(viewingMaterialExam.id)}
        />
      )}

      {choosingMaterialExam && (
        <AddChoiceDialog
          message={`How would you like to add material for ${choosingMaterialExam.subjectLabel}?`}
          onChooseAuto={() => {
            setAttachingMaterialExam(choosingMaterialExam);
            setChoosingMaterialExam(null);
          }}
          onChooseManual={() => {
            setManualMaterialExam(choosingMaterialExam);
            setChoosingMaterialExam(null);
          }}
          onCancel={() => setChoosingMaterialExam(null)}
        />
      )}

      {choosingScheduleAdd && (
        <AddChoiceDialog
          message="How would you like to add your calendar?"
          onChooseAuto={() => {
            setChoosingScheduleAdd(false);
            onReupload();
          }}
          onChooseManual={() => {
            setChoosingScheduleAdd(false);
            onManualEntry();
          }}
          onCancel={() => setChoosingScheduleAdd(false)}
        />
      )}
    </div>
  );
}
