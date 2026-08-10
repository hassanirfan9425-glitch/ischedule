export default function TabBar({ activeTab, onSwitchTab }) {
  return (
    <div className="page-tab-bar">
      <button
        type="button"
        className={activeTab === 'home' ? 'page-tab active' : 'page-tab'}
        onClick={() => onSwitchTab('home')}
      >
        Home
      </button>
      <button
        type="button"
        className={activeTab === 'schedule' ? 'page-tab active' : 'page-tab'}
        onClick={() => onSwitchTab('schedule')}
      >
        Schedule
      </button>
      <button
        type="button"
        className={activeTab === 'academics' ? 'page-tab active' : 'page-tab'}
        onClick={() => onSwitchTab('academics')}
      >
        Academics
      </button>
    </div>
  );
}
