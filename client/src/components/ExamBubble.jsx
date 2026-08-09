import { formatDate, countdownText } from '../utils.js';

export default function ExamBubble({ exam }) {
  const dateLabel = exam.isExactDate
    ? formatDate(exam.date)
    : exam.dateStart && exam.dateEnd
      ? `${formatDate(exam.dateStart)} – ${formatDate(exam.dateEnd)}`
      : 'Date unknown';

  return (
    <div className={`exam-bubble color-${exam.color}${exam.priority ? ' priority-flash' : ''}`}>
      <div className="exam-bubble-days">{countdownText(exam.daysUntil)}</div>
      <div className="exam-bubble-subject">{exam.subjectLabel}</div>
      <div className="exam-bubble-date">
        {dateLabel}
        {exam.time ? ` · ${exam.time}` : ''}
      </div>
      {(exam.term || exam.weekNumber) && (
        <div className="exam-bubble-meta">
          {exam.term ? `Term ${exam.term}` : ''} {exam.weekNumber ? `· Week ${exam.weekNumber}` : ''}
        </div>
      )}
    </div>
  );
}
