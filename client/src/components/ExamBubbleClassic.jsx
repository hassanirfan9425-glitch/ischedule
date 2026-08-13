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
      className={`exam-bubble color-${exam.color}${exam.priority ? ' priority-flash' : ''}`}
      onClick={() => onClick(exam)}
    >
      <div className="exam-bubble-days">{countdownText(exam.daysUntil)}</div>
      <div className="exam-bubble-subject">{exam.subjectLabel}</div>
      <div className="exam-bubble-date">
        {dateLabel}
        {exam.time ? ` · ${exam.time}` : ''}
      </div>
      {(exam.term || exam.weekNumber || exam.difficulty) && (
        <div className="exam-bubble-meta">
          {exam.term ? `Term ${exam.term}` : ''} {exam.weekNumber ? `· Week ${exam.weekNumber}` : ''}
          {exam.difficulty && (
            <span className="exam-bubble-difficulty">{difficultyLabel(exam.difficulty)}</span>
          )}
        </div>
      )}
      <div className="exam-bubble-material-hint">
        {hasMaterial ? 'View material' : 'Add material'}
      </div>
    </button>
  );
}
