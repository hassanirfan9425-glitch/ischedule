import { useState } from 'react';

const WEEKS = Array.from({ length: 14 }, (_, i) => i + 1);
const SUBCOURSE_ORDER = ['Periodic', 'AMS'];

function subjectIdentity(subjectKey, subjectLabel) {
  return subjectKey || `label:${subjectLabel}`;
}

// Every subject always gets both a Periodic and an AMS row, even if one has no grades yet — a
// screenshot only showing periodic entries (or only AMS) shouldn't hide the other section.
// `defaultSubjects` (core subjects + whatever electives this student rated in the quiz) seed the
// table unconditionally, so a subject with zero entries this term still shows up blank instead of
// disappearing — a screenshot that doesn't mention Chemistry shouldn't remove Chemistry.
function buildRows(entries, defaultSubjects, placeholderSubjects) {
  const subjectsByIdentity = new Map();
  const cellsByRowKey = new Map();

  for (const s of defaultSubjects) {
    const identity = subjectIdentity(s.key, s.label);
    if (!subjectsByIdentity.has(identity)) {
      subjectsByIdentity.set(identity, { subjectKey: s.key, subjectLabel: s.label });
    }
  }

  for (const e of entries) {
    const identity = subjectIdentity(e.subjectKey, e.subjectLabel);
    if (!subjectsByIdentity.has(identity)) {
      subjectsByIdentity.set(identity, { subjectKey: e.subjectKey, subjectLabel: e.subjectLabel });
    }
    const subcourseLabel = e.subcourseLabel === 'AMS' ? 'AMS' : 'Periodic';
    const rowKey = `${identity}::${subcourseLabel}`;
    if (!cellsByRowKey.has(rowKey)) cellsByRowKey.set(rowKey, new Map());
    cellsByRowKey.get(rowKey).set(e.weekNumber, e);
  }

  for (const p of placeholderSubjects) {
    const identity = subjectIdentity(p.subjectKey, p.subjectLabel);
    if (!subjectsByIdentity.has(identity)) {
      subjectsByIdentity.set(identity, { subjectKey: p.subjectKey, subjectLabel: p.subjectLabel });
    }
  }

  const rows = [];
  for (const [identity, { subjectKey, subjectLabel }] of subjectsByIdentity) {
    for (const subcourseLabel of SUBCOURSE_ORDER) {
      const rowKey = `${identity}::${subcourseLabel}`;
      rows.push({
        key: rowKey,
        subjectIdentity: identity,
        subjectKey,
        subjectLabel,
        subcourseLabel,
        cells: cellsByRowKey.get(rowKey) || new Map(),
      });
    }
  }
  return rows;
}

export default function GradeTable({
  termData,
  subjects,
  defaultSubjects,
  displayedAverage,
  delta,
  recalculating,
  onRecalculate,
  onAddEntry,
  onDeleteEntry,
  onChangeTerm,
  onDeleteTerm,
}) {
  const { term, entries } = termData;

  // Subjects a student has started (via "+ Add Subject", for something outside their default
  // list) but hasn't entered a grade for yet — once a real entry lands for that subject, it shows
  // up via `entries` instead and this drops out.
  const [placeholderSubjects, setPlaceholderSubjects] = useState([]);
  const existingIdentities = new Set([
    ...entries.map((e) => subjectIdentity(e.subjectKey, e.subjectLabel)),
    ...defaultSubjects.map((s) => subjectIdentity(s.key, s.label)),
  ]);
  const rows = buildRows(
    entries,
    defaultSubjects,
    placeholderSubjects.filter((p) => !existingIdentities.has(subjectIdentity(p.subjectKey, p.subjectLabel)))
  );

  const [editingCell, setEditingCell] = useState(null); // { rowKey, week }
  const [editValue, setEditValue] = useState('');
  const [cellError, setCellError] = useState('');
  const [saving, setSaving] = useState(false);

  const [addingRow, setAddingRow] = useState(false);
  const [newRowSubjectKey, setNewRowSubjectKey] = useState('');
  const [newRowCustomSubject, setNewRowCustomSubject] = useState('');
  const [addRowError, setAddRowError] = useState('');

  const [editingTerm, setEditingTerm] = useState(false);
  const [termValue, setTermValue] = useState(String(term));
  const [termError, setTermError] = useState('');
  const [savingTerm, setSavingTerm] = useState(false);

  function startEdit(row, week) {
    setEditingCell({ rowKey: row.key, week });
    setEditValue('');
    setCellError('');
  }

  async function commitEdit(row) {
    const value = editValue.trim();
    if (!value) {
      setEditingCell(null);
      return;
    }
    const gradeNum = Number(value);
    if (!Number.isFinite(gradeNum) || gradeNum < 0 || gradeNum > 100) {
      setCellError('0-100 only');
      return;
    }
    setSaving(true);
    try {
      await onAddEntry({
        term,
        subjectKey: row.subjectKey || null,
        subjectLabel: row.subjectKey ? undefined : row.subjectLabel,
        subcourseLabel: row.subcourseLabel,
        weekNumber: editingCell.week,
        grade: gradeNum,
      });
      setEditingCell(null);
    } catch (err) {
      setCellError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleAddRow(e) {
    e.preventDefault();
    setAddRowError('');
    const subjectLabel = newRowSubjectKey
      ? subjects.find((s) => s.key === newRowSubjectKey)?.label
      : newRowCustomSubject.trim();
    if (!subjectLabel) {
      setAddRowError('Pick or type a subject.');
      return;
    }
    const identity = subjectIdentity(newRowSubjectKey || null, subjectLabel);
    if (
      existingIdentities.has(identity) ||
      placeholderSubjects.some((p) => subjectIdentity(p.subjectKey, p.subjectLabel) === identity)
    ) {
      setAddRowError('That subject is already in the table.');
      return;
    }
    setPlaceholderSubjects((prev) => [...prev, { subjectKey: newRowSubjectKey || null, subjectLabel }]);
    setNewRowSubjectKey('');
    setNewRowCustomSubject('');
    setAddingRow(false);
  }

  async function commitTermChange() {
    setTermError('');
    const toTerm = Number(termValue);
    if (!Number.isInteger(toTerm) || toTerm < 1 || toTerm > 6) {
      setTermError('Term must be a whole number between 1 and 6.');
      return;
    }
    if (toTerm === term) {
      setEditingTerm(false);
      return;
    }
    setSavingTerm(true);
    try {
      await onChangeTerm(term, toTerm);
      setEditingTerm(false);
    } catch (err) {
      setTermError(err.message);
    } finally {
      setSavingTerm(false);
    }
  }

  return (
    <section className="grade-table-section">
      {editingTerm ? (
        <div className="term-edit-row">
          <label className="term-edit-label">
            Term
            <input
              type="number"
              min="1"
              max="6"
              value={termValue}
              disabled={savingTerm}
              onChange={(e) => setTermValue(e.target.value)}
              autoFocus
            />
          </label>
          <button type="button" className="secondary-btn" onClick={() => setEditingTerm(false)} disabled={savingTerm}>
            Cancel
          </button>
          <button type="button" className="primary-btn" onClick={commitTermChange} disabled={savingTerm}>
            {savingTerm ? 'Saving…' : 'Save'}
          </button>
          {termError && <p className="error-text">{termError}</p>}
        </div>
      ) : (
        <div className="term-heading-row">
          <h2>Term {term}</h2>
          <button
            type="button"
            className="back-link"
            onClick={() => {
              setTermValue(String(term));
              setTermError('');
              setEditingTerm(true);
            }}
          >
            Wrong term? Change it
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="subtle">No grades added for this term yet.</p>
      ) : (
        <div className="grade-table-wrap">
          <table className="grade-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Subcourse</th>
                {WEEKS.map((w) => (
                  <th key={w}>Wk {w}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.subcourseLabel === 'Periodic' ? row.subjectLabel : ''}</td>
                  <td>{row.subcourseLabel}</td>
                  {WEEKS.map((w) => {
                    const cellEntry = row.cells.get(w);
                    const isEditing = editingCell?.rowKey === row.key && editingCell?.week === w;

                    if (isEditing) {
                      return (
                        <td key={w} className="grade-cell-editing">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            autoFocus
                            className="grade-cell-input"
                            value={editValue}
                            disabled={saving}
                            onChange={(e) => {
                              setEditValue(e.target.value);
                              setCellError('');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit(row);
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            onBlur={() => commitEdit(row)}
                          />
                          {cellError && <div className="grade-cell-error">{cellError}</div>}
                        </td>
                      );
                    }

                    return (
                      <td key={w}>
                        {cellEntry ? (
                          <span className="grade-cell">
                            {cellEntry.grade}
                            <button
                              type="button"
                              className="grade-cell-remove"
                              onClick={() => onDeleteEntry(cellEntry.id)}
                              aria-label="Remove entry"
                            >
                              ✕
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="grade-cell-blank"
                            onClick={() => startEdit(row, w)}
                            aria-label={`Add grade for ${row.subjectLabel} ${row.subcourseLabel} week ${w}`}
                          >
                            -
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!addingRow ? (
        <button type="button" className="secondary-btn" onClick={() => setAddingRow(true)}>
          + Add Subject
        </button>
      ) : (
        <form onSubmit={handleAddRow} className="grade-add-form">
          <p className="subtle" style={{ margin: 0 }}>
            Pick a subject: it'll get both a Periodic and an AMS section in the table.
          </p>
          <div className="manual-subject-list">
            {subjects.map((s) => (
              <button
                type="button"
                key={s.key}
                className={newRowSubjectKey === s.key ? 'manual-subject-row active' : 'manual-subject-row'}
                onClick={() => {
                  setNewRowSubjectKey(s.key);
                  setNewRowCustomSubject('');
                }}
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              className={!newRowSubjectKey ? 'manual-subject-row active' : 'manual-subject-row'}
              onClick={() => setNewRowSubjectKey('')}
            >
              Other / not listed
            </button>
          </div>
          {!newRowSubjectKey && (
            <label>
              Subject name
              <input value={newRowCustomSubject} onChange={(e) => setNewRowCustomSubject(e.target.value)} />
            </label>
          )}
          {addRowError && <p className="error-text">{addRowError}</p>}
          <div className="grade-add-actions">
            <button type="button" className="secondary-btn" onClick={() => setAddingRow(false)}>
              Cancel
            </button>
            <button type="submit" className="primary-btn">
              Add Subject
            </button>
          </div>
        </form>
      )}

      <p className="subtle grade-table-hint">Click any blank cell to enter that week's grade.</p>

      <div className="grade-average-row">
        <button type="button" className="secondary-btn" onClick={onRecalculate} disabled={recalculating}>
          {recalculating ? 'Recalculating…' : 'Recalculate Average'}
        </button>
        {displayedAverage !== null && displayedAverage !== undefined && (
          <div className="grade-average-chip">
            <span className="grade-average-value">{Math.round(displayedAverage)}</span>
            {delta && (
              <span className={`grade-average-delta grade-average-delta-${delta.direction}`}>
                {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '–'}
                {delta.direction !== 'same' ? ` ${Math.abs(delta.amount).toFixed(1)}` : ''}
              </span>
            )}
          </div>
        )}
      </div>
      <p className="grade-disclaimer">
        This is a rough estimate based on the entries you've added, not your exact official average.
      </p>
      <p className="grade-disclaimer">Calculation Method by Shahzaib</p>

      <button
        type="button"
        className="secondary-btn danger-hover-btn grade-delete-term-btn"
        onClick={() => onDeleteTerm(term)}
      >
        Delete Grades
      </button>
    </section>
  );
}
