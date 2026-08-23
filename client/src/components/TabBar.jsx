function HomeGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 11.5L12 4l8 7.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 10v8.5a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1V10"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="5" width="17" height="15" rx="3.5" stroke="currentColor" strokeWidth="2.2" />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M8 3v3.5M16 3v3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="8.3" cy="14" r="1.3" fill="currentColor" />
      <circle cx="12.7" cy="14" r="1.3" fill="currentColor" />
    </svg>
  );
}

function BookGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 5.2c2.4-1 5-1 7 0v14.6c-2-1-4.6-1-7 0V5.2Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M20 5.2c-2.4-1-5-1-7 0v14.6c2-1 4.6-1 7 0V5.2Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function TabBar({ activeTab, onSwitchTab }) {
  return (
    <div className="page-tab-bar">
      <button
        type="button"
        className={activeTab === 'home' ? 'page-tab active' : 'page-tab'}
        onClick={() => onSwitchTab('home')}
      >
        <HomeGlyph />
        Home
      </button>
      <button
        type="button"
        className={activeTab === 'schedule' ? 'page-tab active' : 'page-tab'}
        onClick={() => onSwitchTab('schedule')}
      >
        <CalendarGlyph />
        Calendar
      </button>
      <button
        type="button"
        className={activeTab === 'academics' ? 'page-tab active' : 'page-tab'}
        onClick={() => onSwitchTab('academics')}
      >
        <BookGlyph />
        Academics
      </button>
    </div>
  );
}
