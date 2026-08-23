import { formatDate, countdownText } from '../utils.js';

export default function HolidayBubble({ holiday }) {
  return (
    <div className="holiday-row">
      <span className="holiday-row-dot" />
      <div className="holiday-row-body">
        <div className="holiday-row-top">
          <span className="holiday-row-label">{holiday.label}</span>
          <span className="holiday-row-days">{countdownText(holiday.daysUntil)}</span>
        </div>
        <div className="holiday-row-date">
          {formatDate(holiday.dateStart)} – {formatDate(holiday.dateEnd)}
        </div>
      </div>
    </div>
  );
}
