import BrandIcon from './BrandIcon.jsx';
import { APP_VERSION } from '../version.js';

export default function NavDrawer({ open, onClose, groups, highlightLabel = null }) {
  return (
    <>
      <div className={open ? 'drawer-backdrop open' : 'drawer-backdrop'} onClick={onClose} />
      <nav className={open ? 'nav-drawer open' : 'nav-drawer'}>
        <div className="nav-drawer-header">
          <div className="brand" style={{ marginBottom: 0, justifyContent: 'flex-start' }}>
            <BrandIcon size={24} />
            <span className="brand-name">Cram</span>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>
        <div className="nav-drawer-items">
          {groups.map((group, gi) => (
            <div className="nav-drawer-group" key={group.label}>
              <p className="nav-drawer-group-label">{group.label}</p>
              {group.items.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  className={[
                    'nav-drawer-item',
                    item.label === highlightLabel ? 'tutorial-highlight' : '',
                    item.danger ? 'nav-drawer-item-danger' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    onClose();
                    item.onClick();
                  }}
                >
                  {item.icon && <span className="nav-drawer-icon">{item.icon}</span>}
                  {item.label}
                </button>
              ))}
              {gi < groups.length - 1 && <div className="nav-drawer-divider" />}
            </div>
          ))}
        </div>
        <div className="nav-drawer-version">v{APP_VERSION}</div>
      </nav>
    </>
  );
}
