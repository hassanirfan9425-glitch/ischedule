import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { countdownText, formatDate } from '../utils.js';
import OrbitDial from '../components/OrbitDial.jsx';
import OrbitMap from '../components/OrbitMap.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import MaterialPopup from '../components/MaterialPopup.jsx';
import AddChoiceDialog from '../components/AddChoiceDialog.jsx';
import MaterialUpload from './MaterialUpload.jsx';
import ManualMaterialEntry from './ManualMaterialEntry.jsx';
import { useBackHandler } from '../hooks/useBackButton.js';

function examDateLabel(exam) {
  if (exam.isExactDate) return formatDate(exam.date);
  if (exam.dateStart && exam.dateEnd) return `${formatDate(exam.dateStart)} – ${formatDate(exam.dateEnd)}`;
  return 'date unknown';
}

function holidayDurationDays(holiday) {
  const start = new Date(`${holiday.dateStart}T00:00:00`);
  const end = new Date(`${holiday.dateEnd}T00:00:00`);
  return Math.round((end - start) / 86400000) + 1;
}

export default function Dashboard({ greeting, onReupload, onManualEntry, activeTab, onSwitchTab }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmingDeleteSchedule, setConfirmingDeleteSchedule] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState(false);
  const [deleteScheduleError, setDeleteScheduleError] = useState('');
  const [choosingMaterialExam, setChoosingMaterialExam] = useState(null);
  const [attachingMaterialExam, setAttachingMaterialExam] = useState(null);
  const [manualMaterialExam, setManualMaterialExam] = useState(null);
  const [viewingMaterialExam, setViewingMaterialExam] = useState(null);
  const [choosingScheduleAdd, setChoosingScheduleAdd] = useState(false);
  const [viewingHoliday, setViewingHoliday] = useState(null);
  // The map "zooms out" instead of navigating to a separate list — same map, wider data set (every
  // future exam across all terms rather than just the current one), replayed via the key-remount
  // below so the CSS zoom-pop animation always plays on toggle, not just on first mount.
  const [zoomedOut, setZoomedOut] = useState(false);

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
        viewingMaterialExam ||
        choosingMaterialExam ||
        choosingScheduleAdd ||
        viewingHoliday
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
      if (viewingMaterialExam) {
        setViewingMaterialExam(null);
        return;
      }
      if (choosingMaterialExam) {
        setChoosingMaterialExam(null);
        return;
      }
      if (viewingHoliday) {
        setViewingHoliday(null);
        return;
      }
      setChoosingScheduleAdd(false);
    }
  );

  const hasAnyScheduleData =
    data && (data.periodicExams.length > 0 || data.finalExams.length > 0 || data.holidays.length > 0);

  const allUpcoming = data ? [...data.periodicExams, ...data.finalExams] : [];
  const mapExams = zoomedOut && data ? data.allUpcomingExams : allUpcoming;
  // Holidays follow the same base/zoom split as exams: the base map only shows holidays that
  // belong to the current term (same `currentTerm` the server already scoped periodicExams/
  // finalExams to), plus any holiday with no term on record at all (nothing to scope it by, so it
  // stays visible rather than silently disappearing). "See all" reveals every holiday, same as it
  // reveals every exam across all terms.
  const mapHolidays = data
    ? zoomedOut
      ? data.holidays
      : data.holidays.filter((h) => h.term === data.currentTerm || h.term == null)
    : [];
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
    <div className="dashboard orbit-page">
      <OrbitDial activeTab={activeTab} onSwitchTab={onSwitchTab} />
      <div className="orbit-content">
        <header className="orbit-header">
          <div className="orbit-header-eyebrow">Schedule</div>
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
            <div className="empty-landing-title">Add your school schedule</div>
            <p className="empty-landing-hint">
              Upload a PDF or image of your exam &amp; holiday schedule, or enter it manually, to
              build your dashboard.
            </p>
          </div>
        )}

        {data && hasAnyScheduleData && (
          <div className="orbit-map-wrap">
            {data.allUpcomingExams.length > allUpcoming.length && (
              <button type="button" className="orbit-zoom-btn" onClick={() => setZoomedOut((z) => !z)}>
                {zoomedOut ? '← This term' : 'See all →'}
              </button>
            )}

            <OrbitMap
              exams={mapExams}
              holidays={mapHolidays}
              onExamClick={handleExamClick}
              onHolidayClick={setViewingHoliday}
              zoomed={zoomedOut}
            />

            {nextExam && (
              <div className="orbit-map-info">
                <span className="orbit-line-label">
                  {mapExams.length} exam{mapExams.length === 1 ? '' : 's'} in orbit
                </span>
                <span className="orbit-line-value">
                  Next: {nextExam.subjectLabel} · {countdownText(nextExam.daysUntil)}
                </span>
              </div>
            )}
          </div>
        )}

        {hasAnyScheduleData && (
          <button
            type="button"
            className="secondary-btn danger-hover-btn schedule-delete-btn"
            onClick={() => setConfirmingDeleteSchedule(true)}
          >
            Delete Schedule
          </button>
        )}

        {hasAnyScheduleData && (
          <button type="button" className="fab-btn" onClick={() => setChoosingScheduleAdd(true)} title="Update your schedule">
            +
          </button>
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
            message={`${choosingMaterialExam.subjectLabel}, ${examDateLabel(choosingMaterialExam)} (${countdownText(
              choosingMaterialExam.daysUntil
            )}). How would you like to add material?`}
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

        {viewingHoliday && (
          <div className="confirm-backdrop" onClick={() => setViewingHoliday(null)}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <p>{viewingHoliday.label}</p>
              <p className="subtle" style={{ marginTop: 6 }}>
                {formatDate(viewingHoliday.dateStart)} – {formatDate(viewingHoliday.dateEnd)} ·{' '}
                {holidayDurationDays(viewingHoliday)} day{holidayDurationDays(viewingHoliday) === 1 ? '' : 's'} ·{' '}
                {countdownText(viewingHoliday.daysUntil)}
              </p>
              <div className="confirm-actions">
                <button type="button" className="primary-btn" onClick={() => setViewingHoliday(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {choosingScheduleAdd && (
          <AddChoiceDialog
            message="How would you like to add your schedule?"
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
