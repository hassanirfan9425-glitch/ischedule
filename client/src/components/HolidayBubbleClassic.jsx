import { formatDate, countdownText } from '../utils.js';

export default function HolidayBubble({ holiday }) {
  return (
    <div className="holiday-bubble">
      <div className="holiday-bubble-days">{countdownText(holiday.daysUntil)}</div>
      <div className="holiday-bubble-label">{holiday.label}</div>
      <div className="holiday-bubble-date">
        {formatDate(holiday.dateStart)} – {formatDate(holiday.dateEnd)}
      </div>
    </div>
  );
}
