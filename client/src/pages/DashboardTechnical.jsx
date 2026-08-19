import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { countdownText } from '../utils.js';
import ExamBubble from '../components/ExamBubbleTechnical.jsx';
import HolidayBubble from '../components/HolidayBubbleTechnical.jsx';
import CommandBar from '../components/CommandBar.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import MaterialPopup from '../components/MaterialPopup.jsx';
import AddChoiceDialog from '../components/AddChoiceDialog.jsx';
import MaterialUpload from './MaterialUpload.jsx';
import ManualMaterialEntry from './ManualMaterialEntry.jsx';
import { useBackHandler } from '../hooks/useBackButton.js';

function EmptyState({ title, hint }) {
  return (
    <div className="ledger-empty">
      <div className="ledger-empty-title">{title}</div>
      {hint && <div className="ledger-empty-hint">{hint}</div>}
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
        <div className="ledger-table">
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
          hint="Upload your calendar or add exams manually to see them here."
        />
      ) : (
        <div className="ledger-table">
          {exams.map((exam) => (
            <ExamBubble key={exam.id} exam={exam} onClick={onExamClick} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Dashboard({ greeting, onReupload, onManualEntry, activeTab, onSwitchTab }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
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
        confirmingDeleteSchedule ||
        confirmingDeleteFinalSchedule ||
        viewingMaterialExam ||
        choosingMaterialExam ||
        choosingScheduleAdd ||
        viewingAllExams
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
      setViewingAllExams(false);
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

  return (
    <div className="dashboard binder-page">
      <CommandBar activeTab={activeTab} onSwitchTab={onSwitchTab} />
      <div className="binder-content">
        <header className="ledger-header">
          <div className="ledger-header-title">Calendar</div>
          <h1>{greeting}</h1>
        </header>

        {loading && (
          <div className="centered-screen">
            <div className="spinner" />
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        {data && !hasAnyScheduleData && (
          <div className="empty-landing">
            <div className="plus-button" onClick={() => setChoosingScheduleAdd(true)} role="button" tabIndex={0}>
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
              <div className="ledger-line-row ledger-summary-row">
                <span className="ledger-line-label">
                  {allUpcoming.length} upcoming exam{allUpcoming.length === 1 ? '' : 's'}
                </span>
                {nextExam && (
                  <span className="ledger-line-value">
                    Next: {nextExam.subjectLabel} · {countdownText(nextExam.daysUntil)}
                  </span>
                )}
                <button type="button" className="see-all-btn" onClick={() => setViewingAllExams(true)}>
                  See all →
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
                  <h2>Upcoming Holidays</h2>
                  {data.holidays.length === 0 ? (
                    <EmptyState
                      title="No holidays coming up"
                      hint="Check back after your next calendar update."
                    />
                  ) : (
                    <div className="ledger-table">
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
          <button type="button" className="fab-btn" onClick={() => setChoosingScheduleAdd(true)} title="Update your calendar">
            +
          </button>
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
    </div>
  );
}
