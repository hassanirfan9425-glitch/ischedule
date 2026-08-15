import { formatDate, countdownText } from '../utils.js';

export default function HolidayBubble({ holiday }) {
  return (
    <div className="orbit-row orbit-comet color-blue">
      <span className="orbit-row-dot" />
      <div className="orbit-row-main">
        <div className="orbit-row-subject">{holiday.label}</div>
        <div className="orbit-row-meta">
          {formatDate(holiday.dateStart)} – {formatDate(holiday.dateEnd)}
        </div>
      </div>
      <div className="orbit-row-side">
        <div className="orbit-row-days">{countdownText(holiday.daysUntil)}</div>
      </div>
    </div>
  );
}
