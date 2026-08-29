// A persistent (not click-to-reveal) reference so a student can pattern-match their document
// against these instead of reading instructions: two of these document types are already handled
// automatically (see server/src/services/documentClassifier.js's calendar-vs-final-exam-timetable
// split), the third (a daily class/period timetable) isn't something the app has any use for and
// would just burn an AI call for nothing.
//
// This mock is a genuine miniature of the real SABIS calendar layout the user provided (one row
// per week, the Mon-Sun day numbers running across into the SAME row as Academic Milestones /
// Periodic 1 / Periodic 2, under a dark header bar) — not an invented generic calendar shape. Week
// numbers, the highlighted-weekend pattern, and the colored info cells all mirror that real
// document's structure; only the actual subject names, dates, and school branding are stripped out.
const WEEKS = [
  { n: 1, days: [25, 26, 27, 28, 29, 30, 31], milestone: null, hasP1: true, hasP2: true },
  { n: 2, days: [1, 2, 3, 4, 5, 6, 7], milestone: 'warn', hasP1: true, hasP2: true },
  { n: 3, days: [8, 9, 10, 11, 12, 13, 14], milestone: null, hasP1: true, hasP2: true },
];

const CalendarMock = () => (
  <table className="mini-cal-table">
    <thead>
      <tr>
        <th className="mini-cal-term">Term I</th>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <th key={i}>{d}</th>
        ))}
        <th className="mini-cal-info-head">Milestones</th>
        <th className="mini-cal-info-head">Periodic 1</th>
        <th className="mini-cal-info-head">Periodic 2</th>
      </tr>
    </thead>
    <tbody>
      {WEEKS.map((week) => (
        <tr key={week.n}>
          <td className="mini-cal-week">{week.n}</td>
          {week.days.map((d, di) => (
            <td key={di} className={di >= 5 ? 'hl' : undefined}>
              {d}
            </td>
          ))}
          <td>{week.milestone && <i className="clr-warn" />}</td>
          <td>{week.hasP1 && <i className="clr-a" />}</td>
          <td>{week.hasP2 && <i className="clr-b" />}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const ExamScheduleMock = () => (
  <div className="mini-table">
    <div className="mini-table-row mini-table-head">
      <i />
      <i />
      <i />
    </div>
    {[0, 1, 2, 3].map((i) => (
      <div className="mini-table-row" key={i}>
        <i />
        <i className="short" />
        <i className="short" />
      </div>
    ))}
  </div>
);

const TimetableMock = () => (
  <div className="mini-timetable">
    {[0, 1, 2, 3, 4].map((row) => (
      <div className="mini-timetable-row" key={row}>
        {[0, 1, 2, 3, 4].map((col) => (
          <span key={col} />
        ))}
      </div>
    ))}
  </div>
);

const ITEMS = [
  {
    key: 'calendar',
    label: 'Year Calendar',
    hint: 'The whole-year grid with weeks, periodics, and holidays',
    good: true,
    wide: true,
    Mock: CalendarMock,
  },
  {
    key: 'exam-schedule',
    label: 'Final Exam Schedule',
    hint: 'The separate sheet listing final exam dates and times',
    good: true,
    Mock: ExamScheduleMock,
  },
  {
    key: 'timetable',
    label: 'Class Timetable',
    hint: "Your daily period-by-period schedule — this one's not needed",
    good: false,
    Mock: TimetableMock,
  },
];

export default function UploadGuide() {
  return (
    <div className="upload-guide">
      {ITEMS.map(({ key, label, hint, good, wide, Mock }) => (
        <div
          className={['upload-guide-card', good ? '' : 'upload-guide-bad', wide ? 'upload-guide-card-wide' : '']
            .filter(Boolean)
            .join(' ')}
          key={key}
        >
          <div className="upload-guide-mock">
            <Mock />
            <span className={good ? 'upload-guide-badge' : 'upload-guide-badge bad'} aria-hidden="true">
              {good ? '✓' : '✕'}
            </span>
          </div>
          <div className="upload-guide-label">{label}</div>
          <div className="upload-guide-hint">{hint}</div>
        </div>
      ))}
    </div>
  );
}
