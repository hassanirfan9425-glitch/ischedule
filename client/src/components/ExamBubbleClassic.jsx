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
      className={`exam-row color-${exam.color}${exam.priority ? ' priority-flash' : ''}`}
      onClick={() => onClick(exam)}
    >
      <span className="exam-row-dot" />
      <div className="exam-row-body">
        <div className="exam-row-top">
          <span className="exam-row-subject">{exam.subjectLabel}</span>
          <span className="exam-row-days">{countdownText(exam.daysUntil)}</span>
        </div>
        <div className="exam-row-date">
          {dateLabel}
          {exam.time ? ` · ${exam.time}` : ''}
        </div>
        {(exam.term || exam.weekNumber || exam.difficulty) && (
          <div className="exam-row-meta">
            {exam.term ? `Term ${exam.term}` : ''} {exam.weekNumber ? `· Week ${exam.weekNumber}` : ''}
            {exam.difficulty && (
              <span className="exam-row-difficulty">{difficultyLabel(exam.difficulty)}</span>
            )}
          </div>
        )}
        <div className="exam-row-hint">{hasMaterial ? 'View material' : 'Add material'}</div>
      </div>
    </button>
  );
}
