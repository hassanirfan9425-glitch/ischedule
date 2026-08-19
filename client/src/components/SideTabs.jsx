// Replaces the old hamburger + overlay drawer + top pill-tabs entirely. Four real tabs, laid out
// as binder dividers down the left edge of the screen — the active one sticks out further and
// sits flush with the page content, like a divider tab pulled forward in a real binder.
const TABS = [
  { key: 'home', label: 'Home' },
  { key: 'schedule', label: 'Calendar' },
  { key: 'academics', label: 'Academics' },
  { key: 'more', label: 'More' },
];

export default function SideTabs({ activeTab, onSwitchTab }) {
  return (
    <nav className="side-tabs">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={activeTab === tab.key ? 'side-tab active' : 'side-tab'}
          onClick={() => onSwitchTab(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
