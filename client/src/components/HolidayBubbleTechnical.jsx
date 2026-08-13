import { formatDate, countdownText } from '../utils.js';

export default function HolidayBubble({ holiday }) {
  return (
    <div className="ledger-row color-blue">
      <div className="ledger-row-main">
        <div className="ledger-row-subject">{holiday.label}</div>
        <div className="ledger-row-meta">
          {formatDate(holiday.dateStart)} – {formatDate(holiday.dateEnd)}
        </div>
      </div>
      <div className="ledger-row-side">
        <div className="ledger-row-days">{countdownText(holiday.daysUntil)}</div>
      </div>
    </div>
  );
}
