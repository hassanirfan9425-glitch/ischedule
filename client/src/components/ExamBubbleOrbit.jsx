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
      className={`orbit-row color-${exam.color}${exam.priority ? ' priority-glow' : ''}`}
      onClick={() => onClick(exam)}
    >
      <span className="orbit-row-dot" />
      <div className="orbit-row-main">
        <div className="orbit-row-subject">{exam.subjectLabel}</div>
        <div className="orbit-row-meta">
          {dateLabel}
          {exam.time ? ` · ${exam.time}` : ''}
          {exam.term ? ` · Term ${exam.term}` : ''}
          {exam.weekNumber ? ` · Week ${exam.weekNumber}` : ''}
        </div>
        <div className="orbit-row-hint">{hasMaterial ? 'View material' : 'Add material'}</div>
      </div>
      <div className="orbit-row-side">
        <div className="orbit-row-days">{countdownText(exam.daysUntil)}</div>
        {exam.difficulty && <span className="orbit-row-difficulty">{difficultyLabel(exam.difficulty)}</span>}
      </div>
    </button>
  );
}
