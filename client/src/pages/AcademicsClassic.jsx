import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { api } from '../api.js';
import { APK_DOWNLOAD_URL } from '../utils.js';
import BrandIcon from '../components/BrandIcon.jsx';
import NavDrawer from '../components/NavDrawer.jsx';
import { QuizIcon, SwapIcon, SettingsIcon, DownloadIcon, LogoutIcon, TrashIcon } from '../components/NavIcons.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import AddChoiceDialog from '../components/AddChoiceDialog.jsx';
import TabBar from '../components/TabBar.jsx';
import GradeTable from '../components/GradeTable.jsx';
import GradeCalculatorPopup from '../components/GradeCalculatorPopup.jsx';
import AcademicsUpload from './AcademicsUpload.jsx';
import { useBackHandler } from '../hooks/useBackButton.js';

export default function Academics({
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
  const [data, setData] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [defaultSubjects, setDefaultSubjects] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [confirmingDeleteTerm, setConfirmingDeleteTerm] = useState(null);
  const [deletingGrades, setDeletingGrades] = useState(false);
  const [deleteGradesError, setDeleteGradesError] = useState('');
  const [choosingAdd, setChoosingAdd] = useState(false);
  const [uploadingGrades, setUploadingGrades] = useState(false);
  const [displayedAverages, setDisplayedAverages] = useState({});
  const [deltas, setDeltas] = useState({});
  const [recalculatingTerm, setRecalculatingTerm] = useState(null);
  // undefined = closed; {} = open with no preselection (the general "What grade do I need?"
  // button); {kind, term, subjectKey, subjectLabel} = opened from a specific subject/overall
  // Goal badge, locked to that exact record.
  const [goalPopupContext, setGoalPopupContext] = useState(undefined);

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
    Promise.all([
      loadData(),
      Promise.all([api.getSubjectCatalog(), api.getMySubjects()]).then(([catalog, mine]) => {
        setSubjects([...catalog.coreSubjects, ...catalog.subjects]);
        // Every student takes the core subjects, plus Moral Education (auto-included school-wide)
        // — everything else only counts if the student actually rated it in the quiz.
        const ratedKeys = new Set(mine.subjects.map((s) => s.subject_key));
        setDefaultSubjects([
          ...catalog.coreSubjects,
          ...catalog.conditionalCoreSubjects.filter((s) => ratedKeys.has(s.key)),
          ...catalog.subjects.filter((s) => ratedKeys.has(s.key)),
          ...catalog.autoSubjects.filter((s) => s.key === 'moral_education'),
        ]);
      }),
    ]).finally(() => setLoading(false));
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

  const handleDeleteTermGrades = async () => {
    const term = confirmingDeleteTerm;
    setDeletingGrades(true);
    setDeleteGradesError('');
    try {
      await api.deleteGradesByTerm(term);
      await loadData();
      setDisplayedAverages((prev) => {
        const next = { ...prev };
        delete next[term];
        return next;
      });
      setDeltas((prev) => ({ ...prev, [term]: null }));
      setConfirmingDeleteTerm(null);
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

  const handleSetGoal = async (payload) => {
    await api.setGoal(payload);
    await loadData();
  };

  const handleDeleteGoal = async (goalId) => {
    await api.deleteGoal(goalId);
    await loadData();
  };

  const handleOpenGoal = (kind, term, subjectKey, subjectLabel) => {
    setGoalPopupContext({ kind, term, subjectKey, subjectLabel });
  };

  const handleChangeTerm = async (fromTerm, toTerm) => {
    await api.changeGradeTerm(fromTerm, toTerm);
    setDisplayedAverages((prev) => {
      const next = { ...prev };
      delete next[fromTerm];
      delete next[toTerm];
      return next;
    });
    setDeltas((prev) => ({ ...prev, [fromTerm]: null, [toTerm]: null }));
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

  useBackHandler(
    Boolean(
      uploadingGrades || confirmingDelete || confirmingDeleteTerm !== null || choosingAdd || drawerOpen || goalPopupContext
    ),
    () => {
      if (uploadingGrades) {
        setUploadingGrades(false);
        return;
      }
      if (confirmingDelete) {
        setConfirmingDelete(false);
        setDeleteError('');
        return;
      }
      if (confirmingDeleteTerm !== null) {
        setConfirmingDeleteTerm(null);
        setDeleteGradesError('');
        return;
      }
      if (choosingAdd) {
        setChoosingAdd(false);
        return;
      }
      if (goalPopupContext) {
        setGoalPopupContext(undefined);
        return;
      }
      setDrawerOpen(false);
    }
  );

  if (uploadingGrades) {
    return (
      <AcademicsUpload
        onComplete={async () => {
          setUploadingGrades(false);
          setLoading(true);
          await loadData();
          setLoading(false);
        }}
        onCancel={() => setUploadingGrades(false)}
      />
    );
  }

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
      <button type="button" className="hamburger-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
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

      {data && (
        <>
          <div className="grade-table-actions-row">
            <button
              type="button"
              className="bloom-btn-primary"
              data-tutorial="academics-add"
              onClick={() => setChoosingAdd(true)}
            >
              + Add grades
            </button>
            <button
              type="button"
              className="bloom-btn-secondary"
              data-tutorial="academics-goal"
              onClick={() => setGoalPopupContext({})}
            >
              What grade do I need?
            </button>
          </div>
          {data.terms.map((termData) => {
            const avg =
              termData.term in displayedAverages ? displayedAverages[termData.term] : termData.overallAverage;
            const delta = deltas[termData.term];
            return (
              <div key={termData.term} className="bloom-term-wrap">
                <div className="bloom-hero bloom-static-hero">
                  <div className="bloom-lbl">Term {termData.term} overall</div>
                  <div className="bloom-big bloom-term-avg">
                    {avg != null ? `${Math.round(avg)}%` : 'No grades yet'}
                  </div>
                  {avg != null && <div className="bloom-hero-disclaimer">Estimate only, not your official average</div>}
                  {delta && delta.direction !== 'same' && (
                    <div className={`bloom-delta bloom-delta-${delta.direction}`}>
                      {delta.direction === 'up' ? '▲' : '▼'} {Math.abs(delta.amount).toFixed(1)} pts
                    </div>
                  )}
                  <div className="bloom-hero-actions">
                    <button
                      type="button"
                      className="bloom-hero-recalc-btn"
                      onClick={() => handleRecalculate(termData.term)}
                      disabled={recalculatingTerm === termData.term}
                    >
                      {recalculatingTerm === termData.term ? 'Recalculating…' : 'Recalculate Average'}
                    </button>
                    <button
                      type="button"
                      className={
                        termData.goals?.overall ? 'grade-goal-badge grade-goal-badge-set' : 'grade-goal-badge'
                      }
                      title={
                        termData.goals?.overall
                          ? `Overall goal: ${termData.goals.overall.targetAverage}`
                          : 'Set an overall goal for this term'
                      }
                      onClick={() => handleOpenGoal('overall', termData.term)}
                    >
                      {termData.goals?.overall ? termData.goals.overall.targetAverage : 'Set Overall Goal'}
                    </button>
                  </div>
                </div>
                <GradeTable
                  termData={termData}
                  subjects={subjects}
                  defaultSubjects={defaultSubjects}
                  displayedAverage={avg}
                  delta={delta}
                  recalculating={recalculatingTerm === termData.term}
                  onRecalculate={() => handleRecalculate(termData.term)}
                  onAddEntry={handleAddEntry}
                  onDeleteEntry={handleDeleteEntry}
                  onChangeTerm={handleChangeTerm}
                  onDeleteTerm={(term) => setConfirmingDeleteTerm(term)}
                  subjectGoals={termData.goals?.subjects || {}}
                  overallGoal={termData.goals?.overall || null}
                  onOpenGoal={handleOpenGoal}
                  hideOverallSummary
                />
              </div>
            );
          })}
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

      {confirmingDeleteTerm !== null && (
        <ConfirmDialog
          message={`Are you sure you want to delete all grades for Term ${confirmingDeleteTerm}? This cannot be undone.`}
          confirmLabel="Delete Grades"
          danger
          busy={deletingGrades}
          error={deleteGradesError}
          onCancel={() => {
            setConfirmingDeleteTerm(null);
            setDeleteGradesError('');
          }}
          onConfirm={handleDeleteTermGrades}
        />
      )}

      {choosingAdd && (
        <AddChoiceDialog
          message="How would you like to add your grades?"
          onChooseAuto={() => {
            setChoosingAdd(false);
            setUploadingGrades(true);
          }}
          onChooseManual={() => setChoosingAdd(false)}
          onCancel={() => setChoosingAdd(false)}
        />
      )}

      {goalPopupContext && data && (
        <GradeCalculatorPopup
          terms={data.terms}
          currentTerm={data.currentTerm}
          initialContext={goalPopupContext.kind ? goalPopupContext : null}
          onSetGoal={handleSetGoal}
          onDeleteGoal={handleDeleteGoal}
          onClose={() => setGoalPopupContext(undefined)}
        />
      )}
    </div>
  );
}
