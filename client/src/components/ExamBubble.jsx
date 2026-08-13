import { formatDate, countdownText, difficultyLabel } from '../utils.js';

export default function ExamBubble({ exam, onClick }) {
  const dateLabel = exam.isExactDate
    ? formatDate(exam.date)
    : exam.dateStart && exam.dateEnd
      ? `${formatDate(exam.dateStart)} – ${formatDate(exam.dateEnd)}`
      : 'Date unknown';
  const hasMaterial = !!exam.material;

  return (
    <button
      type="button"
      className={`ledger-row color-${exam.color}${exam.priority ? ' priority-flash' : ''}`}
      onClick={() => onClick(exam)}
    >
      <div className="ledger-row-main">
        <div className="ledger-row-subject">{exam.subjectLabel}</div>
        <div className="ledger-row-meta">
          {dateLabel}
          {exam.time ? ` · ${exam.time}` : ''}
          {exam.term ? ` · Term ${exam.term}` : ''}
          {exam.weekNumber ? ` · Week ${exam.weekNumber}` : ''}
        </div>
        <div className="ledger-row-hint">{hasMaterial ? 'View material' : 'Add material'}</div>
      </div>
      <div className="ledger-row-side">
        <div className="ledger-row-days">{countdownText(exam.daysUntil)}</div>
        {exam.difficulty && <span className="ledger-row-difficulty">{difficultyLabel(exam.difficulty)}</span>}
      </div>
    </button>
  );
}
