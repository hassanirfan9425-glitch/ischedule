import CalendarIcon from './CalendarIcon.jsx';

export default function NavDrawer({ open, onClose, items }) {
  return (
    <>
      <div className={open ? 'drawer-backdrop open' : 'drawer-backdrop'} onClick={onClose} />
      <nav className={open ? 'nav-drawer open' : 'nav-drawer'}>
        <div className="nav-drawer-header">
          <div className="brand" style={{ marginBottom: 0, justifyContent: 'flex-start' }}>
            <CalendarIcon size={24} />
            <span className="brand-name">iSchedule</span>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>
        <div className="nav-drawer-items">
          {items.map((item) => (
            <button
              type="button"
              key={item.label}
              className="nav-drawer-item"
              onClick={() => {
                onClose();
                item.onClick();
              }}
            >
              {item.icon && <span className="nav-drawer-icon">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
