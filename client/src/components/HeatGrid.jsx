import { useState } from 'react';
import { useStreakAnimation } from '../hooks/useStreakAnimation.js';

const WEEKS = Array.from({ length: 14 }, (_, i) => i + 1);
const SUBCOURSE_ORDER = ['Periodic', 'AMS'];

function subjectIdentity(subjectKey, subjectLabel) {
  return subjectKey || `label:${subjectLabel}`;
}

// Same shape as GradeTable's row-builder — kept as its own copy here since High-Tech pages are
// already a self-contained set. Every subject always gets both a Periodic and an AMS row, and
// `defaultSubjects` seeds the grid even for subjects with zero entries yet this term.
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

function gradeBand(grade) {
  if (grade >= 85) return 'ok';
  if (grade >= 60) return 'warn';
  return 'crit';
}

function HeatGridRow({ row, subcourseLabel, displayStreak, streakAtRisk, streakAnim, editingCell, editValue, setEditValue, cellError, saving, startEdit, commitEdit, setEditingCell, setCellError, onDeleteEntry }) {
  return (
    <div className={`hgrid-row hgrid-row-${subcourseLabel.toLowerCase()}`}>
      <div className="hgrid-row-label">
        <span className="hgrid-process-name">
          {subcourseLabel === 'Periodic' ? (
            row.subjectLabel
          ) : (
            displayStreak > 0 && (
              <span
                className={`streak-badge ${streakAtRisk ? 'streak-badge-atrisk' : ''} ${
                  streakAnim ? `streak-anim-${streakAnim.type}` : ''
                }`.trim()}
                title={
                  streakAtRisk
                    ? `${displayStreak}-week AMS streak at risk: a 90+ next recovers it`
                    : `${displayStreak}-week streak of AMS grades at 90 or above`
                }
              >
                [{displayStreak}]
              </span>
            )
          )}
        </span>
        <span className={`hgrid-process-tag hgrid-process-tag-${subcourseLabel.toLowerCase()}`}>{subcourseLabel.toUpperCase()}</span>
      </div>

      <div className="hgrid-cells">
        {WEEKS.map((w) => {
          const cellEntry = row.cells.get(w);
          const isEditing = editingCell?.rowKey === row.key && editingCell?.week === w;

          if (isEditing) {
            return (
              <div key={w} className="hgrid-cell-editing">
                <input
                  type="number"
                  min="0"
                  max="100"
                  autoFocus
                  className="hgrid-cell-input"
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
                {cellError && <span className="hgrid-cell-error">{cellError}</span>}
              </div>
            );
          }

          if (cellEntry) {
            return (
              <div key={w} className="hgrid-cell-wrap">
                <button
                  type="button"
                  className={`hgrid-cell hgrid-cell-${gradeBand(cellEntry.grade)}`}
                  onClick={() => startEdit(row, w)}
                  title={`${row.subjectLabel} ${subcourseLabel} · Week ${w}`}
                >
                  {cellEntry.grade}
                </button>
                <button
                  type="button"
                  className="hgrid-cell-remove"
                  onClick={() => onDeleteEntry(cellEntry.id)}
                  aria-label={`Remove ${row.subjectLabel} ${subcourseLabel} week ${w} entry`}
                >
                  ×
                </button>
              </div>
            );
          }

          return (
            <button
              key={w}
              type="button"
              className="hgrid-cell hgrid-cell-empty"
              onClick={() => startEdit(row, w)}
              aria-label={`Log ${row.subjectLabel} ${subcourseLabel} week ${w} entry`}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function HeatGrid({
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
  subjectGoals,
  overallGoal,
  onOpenGoal,
}) {
  const { term, entries, subjectAverages } = termData;

  // Per-subject pass/fail badges read from here — one entry per subject that has at least one
  // grade entered, keyed the same way rows are (subjectKey when known, else the label).
  const averageBySubjectIdentity = new Map(
    (subjectAverages || []).map((s) => [subjectIdentity(s.subjectKey, s.subjectLabel), s])
  );
  const streakAnimations = useStreakAnimation(subjectAverages);

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

  const subjectGroups = [];
  const seenIdentity = new Set();
  for (const row of rows) {
    if (seenIdentity.has(row.subjectIdentity)) continue;
    seenIdentity.add(row.subjectIdentity);
    subjectGroups.push({
      identity: row.subjectIdentity,
      subjectLabel: row.subjectLabel,
      rows: rows.filter((r) => r.subjectIdentity === row.subjectIdentity),
    });
  }

  const [editingCell, setEditingCell] = useState(null);
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
      setAddRowError('That subject is already in the grid.');
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
    <section className="hgrid-section">
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
        <div className="hgrid-wrap">
          <div className="hgrid-scroll">
            {subjectGroups.map((group) => {
              const subjectAverage = averageBySubjectIdentity.get(group.identity);
              const streakAnim = streakAnimations[group.identity];
              const displayStreak = streakAnim ? streakAnim.streak : subjectAverage?.amsStreak;
              const streakAtRisk = !streakAnim && subjectAverage?.amsStreakStatus === 'atRisk';
              return (
              <div key={group.identity} className="hgrid-subject-block">
                {group.rows.map((row) => (
                  <HeatGridRow
                    key={row.key}
                    row={row}
                    subcourseLabel={row.subcourseLabel}
                    displayStreak={displayStreak}
                    streakAtRisk={streakAtRisk}
                    streakAnim={streakAnim}
                    editingCell={editingCell}
                    editValue={editValue}
                    setEditValue={setEditValue}
                    cellError={cellError}
                    saving={saving}
                    startEdit={startEdit}
                    commitEdit={commitEdit}
                    setEditingCell={setEditingCell}
                    setCellError={setCellError}
                    onDeleteEntry={onDeleteEntry}
                  />
                ))}
                {averageBySubjectIdentity.has(group.identity) && (
                  <div className="hgrid-subject-badge-slot">
                    <span
                      className={`grade-pass-badge ${
                        averageBySubjectIdentity.get(group.identity).passing
                          ? 'grade-pass-badge-pass'
                          : 'grade-pass-badge-fail'
                      }`}
                      title={averageBySubjectIdentity.get(group.identity).passing ? 'Passing' : 'Failing'}
                    >
                      {averageBySubjectIdentity.get(group.identity).average.toFixed(1)}
                    </span>
                  </div>
                )}
                {(() => {
                  const goal = subjectGoals?.[group.identity];
                  return (
                    <button
                      type="button"
                      className={goal ? 'grade-goal-badge grade-goal-badge-set' : 'grade-goal-badge'}
                      title={goal ? `Goal: ${goal.targetAverage}` : 'Set a goal for this subject'}
                      onClick={() => onOpenGoal('subject', term, group.rows[0]?.subjectKey, group.subjectLabel)}
                    >
                      {goal ? goal.targetAverage : 'Goal'}
                    </button>
                  );
                })()}
              </div>
              );
            })}
            <div className="hgrid-week-axis">
              <span className="hgrid-week-axis-spacer" />
              {WEEKS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {!addingRow ? (
        <button type="button" className="secondary-btn" onClick={() => setAddingRow(true)}>
          + Add Subject
        </button>
      ) : (
        <form onSubmit={handleAddRow} className="grade-add-form">
          <p className="subtle" style={{ margin: 0 }}>
            Pick a subject: it'll get both a Periodic and an AMS row in the grid.
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

      <p className="subtle grade-table-hint">Click any tile to edit that week's grade, or an empty tile to add one.</p>

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
        <button
          type="button"
          className={overallGoal ? 'grade-goal-badge grade-goal-badge-set' : 'grade-goal-badge'}
          title={overallGoal ? `Overall goal: ${overallGoal.targetAverage}` : 'Set an overall goal for this term'}
          onClick={() => onOpenGoal('overall', term)}
        >
          {overallGoal ? overallGoal.targetAverage : 'Set Overall Goal'}
        </button>
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
