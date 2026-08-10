import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { countdownText } from '../utils.js';
import ExamBubble from '../components/ExamBubble.jsx';
import HolidayBubble from '../components/HolidayBubble.jsx';
import NavDrawer from '../components/NavDrawer.jsx';
import CalendarIcon from '../components/CalendarIcon.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import MaterialPopup from '../components/MaterialPopup.jsx';
import MaterialChoiceDialog from '../components/MaterialChoiceDialog.jsx';
import MaterialUpload from './MaterialUpload.jsx';
import ManualMaterialEntry from './ManualMaterialEntry.jsx';

function EmptyState({ title, hint }) {
  return (
    <div className="empty-state">
      <CalendarIcon size={22} />
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
      <h2>{title}</h2>
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
      <h2>All Upcoming Exams</h2>
      {exams.length === 0 ? (
        <EmptyState
          title="Nothing on the horizon"
          hint="Upload your schedule or add exams manually to see them here."
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
  user,
  onLogout,
  onReupload,
  onRetakeQuiz,
  onSettings,
  onManualEntry,
  onDeleteAccount,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [choosingMaterialExam, setChoosingMaterialExam] = useState(null);
  const [attachingMaterialExam, setAttachingMaterialExam] = useState(null);
  const [manualMaterialExam, setManualMaterialExam] = useState(null);
  const [viewingMaterialExam, setViewingMaterialExam] = useState(null);
  const [viewingAllExams, setViewingAllExams] = useState(false);

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
  const navItems = [
    { label: 'Retake Quiz', onClick: onRetakeQuiz },
    { label: 'Update Schedule', onClick: onReupload },
    { label: 'Enter Schedule Manually', onClick: onManualEntry },
    { label: 'Settings', onClick: onSettings },
    { label: 'Log Out', onClick: onLogout },
    { label: 'Delete Account', onClick: () => setConfirmingDelete(true) },
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
      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} items={navItems} />

      <header className="dashboard-header" style={{ paddingLeft: 76 }}>
        <div className="brand" style={{ marginBottom: 0, justifyContent: 'flex-start' }}>
          <CalendarIcon />
          <div>
            <div className="brand-name" style={{ fontSize: '1.1rem' }}>
              iSchedule
            </div>
            <h1 style={{ fontSize: '1.4rem' }}>Hey {user.name}</h1>
          </div>
        </div>
      </header>

      {loading && (
        <div className="centered-screen">
          <div className="spinner" />
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {data && (
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
                emptyHint="Upload your schedule or add exams manually to see them here."
                exams={data.periodicExams}
                onExamClick={handleExamClick}
              />
              <ExamSection
                title="Final Exams"
                emptyTitle="No finals scheduled yet"
                emptyHint="They'll show up here once your schedule includes them."
                exams={data.finalExams}
                onExamClick={handleExamClick}
              />

              <section>
                <h2>Upcoming Holidays</h2>
                {data.holidays.length === 0 ? (
                  <EmptyState
                    title="No holidays coming up"
                    hint="Check back after your next schedule update."
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

      <button type="button" className="fab-btn" onClick={onReupload} title="Update your schedule">
        +
      </button>

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

      {viewingMaterialExam && (
        <MaterialPopup
          exam={viewingMaterialExam}
          onClose={() => setViewingMaterialExam(null)}
          onUpdate={() => {
            setChoosingMaterialExam(viewingMaterialExam);
            setViewingMaterialExam(null);
          }}
        />
      )}

      {choosingMaterialExam && (
        <MaterialChoiceDialog
          exam={choosingMaterialExam}
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
    </div>
  );
}
