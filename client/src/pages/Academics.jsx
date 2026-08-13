import { useEffect, useState } from 'react';
import { api } from '../api.js';
import CommandBar from '../components/CommandBar.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import AddChoiceDialog from '../components/AddChoiceDialog.jsx';
import GradeTable from '../components/GradeTable.jsx';
import AcademicsUpload from './AcademicsUpload.jsx';
import { useBackHandler } from '../hooks/useBackButton.js';

export default function Academics({ greeting, activeTab, onSwitchTab }) {
  const [data, setData] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [defaultSubjects, setDefaultSubjects] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmingDeleteTerm, setConfirmingDeleteTerm] = useState(null);
  const [deletingGrades, setDeletingGrades] = useState(false);
  const [deleteGradesError, setDeleteGradesError] = useState('');
  const [choosingAdd, setChoosingAdd] = useState(false);
  const [uploadingGrades, setUploadingGrades] = useState(false);
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

  useBackHandler(Boolean(uploadingGrades || confirmingDeleteTerm !== null || choosingAdd), () => {
    if (uploadingGrades) {
      setUploadingGrades(false);
      return;
    }
    if (confirmingDeleteTerm !== null) {
      setConfirmingDeleteTerm(null);
      setDeleteGradesError('');
      return;
    }
    setChoosingAdd(false);
  });

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

  return (
    <div className="dashboard binder-page">
      <CommandBar activeTab={activeTab} onSwitchTab={onSwitchTab} />
      <div className="binder-content">
        <header className="ledger-header">
          <div className="ledger-header-title">Academics</div>
          <h1>{greeting}</h1>
        </header>

        {loading && (
          <div className="centered-screen">
            <div className="spinner" />
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        {data && (
          <>
            <button type="button" className="see-all-btn" style={{ marginBottom: 12 }} onClick={() => setChoosingAdd(true)}>
              + Add grades
            </button>
            {data.terms.map((termData) => (
              <GradeTable
                key={termData.term}
                termData={termData}
                subjects={subjects}
                defaultSubjects={defaultSubjects}
                displayedAverage={
                  termData.term in displayedAverages ? displayedAverages[termData.term] : termData.overallAverage
                }
                delta={deltas[termData.term]}
                recalculating={recalculatingTerm === termData.term}
                onRecalculate={() => handleRecalculate(termData.term)}
                onAddEntry={handleAddEntry}
                onDeleteEntry={handleDeleteEntry}
                onChangeTerm={handleChangeTerm}
                onDeleteTerm={(term) => setConfirmingDeleteTerm(term)}
              />
            ))}
          </>
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
      </div>
    </div>
  );
}
