import { formatDate } from '../utils.js';

export default function MaterialPopup({ exam, onClose, onUpdate }) {
  const { quizzes, questions } = exam.material;
  const dateLabel = exam.isExactDate
    ? formatDate(exam.date)
    : exam.dateStart && exam.dateEnd
      ? `${formatDate(exam.dateStart)} – ${formatDate(exam.dateEnd)}`
      : '';

  return (
    <div className="confirm-backdrop" onClick={onClose}>
      <div className="material-popup" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="material-popup-header">
          <div className="material-popup-subject">{exam.subjectLabel}</div>
          {dateLabel && <div className="material-popup-date">{dateLabel}</div>}
        </div>

        {quizzes.length === 0 && questions.length === 0 ? (
          <p className="subtle">No quizzes or questions were found in the attached material.</p>
        ) : (
          <>
            {quizzes.length > 0 && (
              <div className="material-group">
                <h3>Quizzes</h3>
                <ul>
                  {quizzes.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {questions.length > 0 && (
              <div className="material-group">
                <h3>Questions</h3>
                <ul>
                  {questions.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <button type="button" className="secondary-btn" onClick={onUpdate}>
          Update Material
        </button>
      </div>
    </div>
  );
}
