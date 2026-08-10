import { useState } from 'react';

const WEEKS = Array.from({ length: 14 }, (_, i) => i + 1);

function pivotEntries(entries) {
  const rowMap = new Map();
  for (const e of entries) {
    const key = `${e.subjectLabel}::${e.subcourseLabel}`;
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        key,
        subjectKey: e.subjectKey,
        subjectLabel: e.subjectLabel,
        subcourseLabel: e.subcourseLabel,
        cells: new Map(),
      });
    }
    rowMap.get(key).cells.set(e.weekNumber, e);
  }
  return rowMap;
}

export default function GradeTable({
  termData,
  subjects,
  displayedAverage,
  delta,
  recalculating,
  onRecalculate,
  onAddEntry,
  onDeleteEntry,
}) {
  const { term, entries } = termData;
  const realRows = pivotEntries(entries);

  // Rows a student has started (via "+ Add Subject Row") but hasn't entered a grade for yet —
  // once their first cell is saved, the row shows up via realRows instead and this drops out.
  const [placeholderRows, setPlaceholderRows] = useState([]);
  const rows = [...realRows.values(), ...placeholderRows.filter((p) => !realRows.has(p.key))];

  const [editingCell, setEditingCell] = useState(null); // { rowKey, week }
  const [editValue, setEditValue] = useState('');
  const [cellError, setCellError] = useState('');
  const [saving, setSaving] = useState(false);

  const [addingRow, setAddingRow] = useState(false);
  const [newRowSubjectKey, setNewRowSubjectKey] = useState('');
  const [newRowCustomSubject, setNewRowCustomSubject] = useState('');
  const [newRowSubcourse, setNewRowSubcourse] = useState('AMS');
  const [addRowError, setAddRowError] = useState('');

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
    const key = `${subjectLabel}::${newRowSubcourse}`;
    if (realRows.has(key) || placeholderRows.some((p) => p.key === key)) {
      setAddRowError('That row already exists.');
      return;
    }
    setPlaceholderRows((prev) => [
      ...prev,
      {
        key,
        subjectKey: newRowSubjectKey || null,
        subjectLabel,
        subcourseLabel: newRowSubcourse,
        cells: new Map(),
      },
    ]);
    setNewRowSubjectKey('');
    setNewRowCustomSubject('');
    setNewRowSubcourse('AMS');
    setAddingRow(false);
  }

  return (
    <section className="grade-table-section">
      <h2>Term {term}</h2>

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
                  <td>{row.subjectLabel}</td>
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
                            —
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
          + Add Subject Row
        </button>
      ) : (
        <form onSubmit={handleAddRow} className="grade-add-form">
          <label>
            Subject
            <select value={newRowSubjectKey} onChange={(e) => setNewRowSubjectKey(e.target.value)}>
              <option value="">Other / type below</option>
              {subjects.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {!newRowSubjectKey && (
            <label>
              Subject name
              <input value={newRowCustomSubject} onChange={(e) => setNewRowCustomSubject(e.target.value)} />
            </label>
          )}
          <label>
            Type
            <select value={newRowSubcourse} onChange={(e) => setNewRowSubcourse(e.target.value)}>
              <option value="AMS">AMS (weekly)</option>
              <option value="Periodic">Periodic (exam)</option>
            </select>
          </label>
          {addRowError && <p className="error-text">{addRowError}</p>}
          <div className="grade-add-actions">
            <button type="button" className="secondary-btn" onClick={() => setAddingRow(false)}>
              Cancel
            </button>
            <button type="submit" className="primary-btn">
              Add Row
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
        This is a rough estimate based on the entries you've added — not your exact official average.
      </p>
    </section>
  );
}
