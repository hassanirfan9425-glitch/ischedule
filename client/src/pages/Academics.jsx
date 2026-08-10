import { useEffect, useState } from 'react';
import { api } from '../api.js';
import CalendarIcon from '../components/CalendarIcon.jsx';
import NavDrawer from '../components/NavDrawer.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import AddChoiceDialog from '../components/AddChoiceDialog.jsx';
import TabBar from '../components/TabBar.jsx';
import GradeTable from '../components/GradeTable.jsx';
import AcademicsUpload from './AcademicsUpload.jsx';

export default function Academics({
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
  const [data, setData] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [error, setError] = useState('');
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
  const [choosingAdd, setChoosingAdd] = useState(false);
  const [uploadingGrades, setUploadingGrades] = useState(false);
  const [forceShowTables, setForceShowTables] = useState(false);
  const [displayedAverages, setDisplayedAverages] = useState({});
  const [deltas, setDeltas] = useState({});
  const [recalculatingTerm, setRecalculatingTerm] = useState(null);

  const loadData = () =>
    api
      .getAcademics()
      .then((fresh) => {
        setData(fresh);
        setDisplayedAverages((prev) => {
          const next = { ...prev };
          for (const t of fresh.terms) {
            if (!(t.term in next)) next[t.term] = t.overallAverage;
          }
          return next;
        });
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    Promise.all([loadData(), api.getSubjectCatalog().then((cat) => setSubjects([...cat.coreSubjects, ...cat.subjects]))])
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
      await loadData();
      setForceShowTables(false);
      setDisplayedAverages({});
      setDeltas({});
      setConfirmingDeleteGrades(false);
    } catch (err) {
      setDeleteGradesError(err.message);
    } finally {
      setDeletingGrades(false);
    }
  };

  const handleAddEntry = async (entry) => {
    await api.addGradeManual(entry);
    await loadData();
  };

  const handleDeleteEntry = async (id) => {
    await api.deleteGradeEntry(id);
    await loadData();
  };

  const handleRecalculate = async (term) => {
    setRecalculatingTerm(term);
    try {
      const fresh = await api.getAcademics();
      setData(fresh);
      const termData = fresh.terms.find((t) => t.term === term);
      const newAverage = termData ? termData.overallAverage : null;
      const prevAverage = displayedAverages[term];

      if (prevAverage != null && newAverage != null) {
        const diff = newAverage - prevAverage;
        setDeltas((prev) => ({
          ...prev,
          [term]: { direction: Math.abs(diff) < 0.05 ? 'same' : diff > 0 ? 'up' : 'down', amount: diff },
        }));
      } else {
        setDeltas((prev) => ({ ...prev, [term]: null }));
      }
      setDisplayedAverages((prev) => ({ ...prev, [term]: newAverage }));
    } finally {
      setRecalculatingTerm(null);
    }
  };

  if (uploadingGrades) {
    return (
      <AcademicsUpload
        onComplete={async () => {
          setUploadingGrades(false);
          setForceShowTables(true);
          setLoading(true);
          await loadData();
          setLoading(false);
        }}
        onCancel={() => setUploadingGrades(false)}
      />
    );
  }

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

  const hasAnyGrades = data && data.terms.some((t) => t.entries.length > 0);

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
              iGrade
            </div>
            <h1 style={{ fontSize: '1.4rem' }}>Academics</h1>
          </div>
        </div>
      </header>

      <TabBar activeTab={activeTab} onSwitchTab={onSwitchTab} />

      {loading && (
        <div className="centered-screen">
          <div className="spinner" />
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {data && !hasAnyGrades && !forceShowTables && (
        <div className="empty-landing">
          <div className="plus-button" onClick={() => setChoosingAdd(true)} role="button" tabIndex={0}>
            +
          </div>
          <div className="empty-landing-title">Add your grades</div>
          <p className="empty-landing-hint">
            Upload a photo or PDF of your grade report, or enter grades manually, to build your
            academics table.
          </p>
          <div className="empty-landing-disclaimer">
            It's recommended to add your schedule first — grades get tagged to the right term based
            on it.
          </div>
        </div>
      )}

      {data && (hasAnyGrades || forceShowTables) && (
        <>
          <button type="button" className="see-all-btn" style={{ marginBottom: 12 }} onClick={() => setChoosingAdd(true)}>
            + Add grades
          </button>
          {data.terms.map((termData) => (
            <GradeTable
              key={termData.term}
              termData={termData}
              subjects={subjects}
              displayedAverage={
                termData.term in displayedAverages ? displayedAverages[termData.term] : termData.overallAverage
              }
              delta={deltas[termData.term]}
              recalculating={recalculatingTerm === termData.term}
              onRecalculate={() => handleRecalculate(termData.term)}
              onAddEntry={handleAddEntry}
              onDeleteEntry={handleDeleteEntry}
            />
          ))}
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

      {choosingAdd && (
        <AddChoiceDialog
          message="How would you like to add your grades?"
          onChooseAuto={() => {
            setChoosingAdd(false);
            setUploadingGrades(true);
          }}
          onChooseManual={() => {
            setChoosingAdd(false);
            setForceShowTables(true);
          }}
          onCancel={() => setChoosingAdd(false)}
        />
      )}
    </div>
  );
}
