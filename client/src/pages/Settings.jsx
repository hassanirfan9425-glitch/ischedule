import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import CalendarIcon from '../components/CalendarIcon.jsx';

// Static and tiny — fetching this from the server on every Settings open added a real, noticeable
// (2-3s) delay before the swatches appeared, since it's a network round trip the rest of this page
// doesn't need. Mirrors server/src/constants/themes.js; only affects brand/decorative colors, exam-
// difficulty colors never change. Keep in sync with that file when adding/removing a theme.
const THEMES = [
  { key: 'terracotta', label: 'Terracotta & Cream', swatch: ['#d2551f', '#fdf3ec'] },
  { key: 'green', label: 'Green & White', swatch: ['#22c55e', '#ffffff'] },
  { key: 'red_blue', label: 'Red & Blue', swatch: ['#ef4444', '#3b82f6'] },
  { key: 'purple_pink', label: 'Purple & Pink', swatch: ['#a855f7', '#ec4899'] },
  { key: 'black_grey', label: 'Black & Grey', swatch: ['#27272a', '#a1a1aa'] },
  { key: 'gold_navy', label: 'Gold & Dark Blue', swatch: ['#eab308', '#1e3a8a'] },
  { key: 'blue_white', label: 'Blue & White', swatch: ['#3b82f6', '#ffffff'] },
  { key: 'garnet', label: 'Garnet & Wine', swatch: ['#b3123f', '#4c0519'] },
  { key: 'sapphire', label: 'Sapphire & Ink', swatch: ['#1454b3', '#0f172a'] },
  { key: 'emerald', label: 'Emerald & Jade', swatch: ['#0e9e5e', '#134e3a'] },
  { key: 'black_gold', label: 'Black & Gold', swatch: ['#c99a2e', '#0a0a0a'] },
  { key: 'cyber', label: 'Cyan & Magenta', swatch: ['#06b6d4', '#d946ef'] },
];

export default function Settings({ user, onBack, onUserUpdated }) {
  const [username, setUsername] = useState(user.username);
  const [name, setName] = useState(user.name);
  const [theme, setTheme] = useState(user.theme);
  const [uiStyle, setUiStyle] = useState(user.uiStyle || 'classic');
  const [autoAdjustDifficulty, setAutoAdjustDifficulty] = useState(!!user.autoAdjustDifficulty);
  const [error, setError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const savedToastTimer = useRef(null);

  useEffect(() => {
    return () => clearTimeout(savedToastTimer.current);
  }, []);

  function handleThemePick(nextTheme) {
    // Just a local pick — the swatch shows as selected immediately, but the theme doesn't
    // actually apply anywhere else in the app until Save Changes is pressed below.
    setTheme(nextTheme);
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setError('');
    setSavingProfile(true);
    try {
      const data = await api.updateProfile({ username, name, theme, uiStyle, autoAdjustDifficulty });
      onUserUpdated(data.user);
      setShowSavedToast(true);
      clearTimeout(savedToastTimer.current);
      savedToastTimer.current = setTimeout(() => setShowSavedToast(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="centered-screen">
      <div className="settings-card">
        <button type="button" className="back-link" onClick={onBack}>
          ← Back to dashboard
        </button>
        <div className="brand">
          <CalendarIcon />
          <span className="brand-name">Study Compass</span>
        </div>
        <h1>Settings</h1>

        <h2 style={{ marginTop: 20 }}>Color theme</h2>
        <div className="theme-picker" data-tutorial="color-theme">
          {THEMES.map((t) => (
            <button
              type="button"
              key={t.key}
              className={theme === t.key ? 'theme-swatch active' : 'theme-swatch'}
              onClick={() => handleThemePick(t.key)}
            >
              <span
                className="theme-swatch-dot"
                style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }}
              />
              {t.label}
            </button>
          ))}
        </div>

        <h2>UI style</h2>
        <p className="subtle" style={{ marginTop: -8 }}>
          Changes on Save, just like the color theme above.
        </p>
        <div className="theme-picker" data-tutorial="ui-style">
          <button
            type="button"
            className={uiStyle === 'classic' ? 'theme-swatch active' : 'theme-swatch'}
            onClick={() => setUiStyle('classic')}
          >
            Classic
          </button>
          <button
            type="button"
            className={uiStyle === 'technical' ? 'theme-swatch active' : 'theme-swatch'}
            onClick={() => setUiStyle('technical')}
          >
            High-Tech
          </button>
          <button
            type="button"
            className={uiStyle === 'orbit' ? 'theme-swatch active' : 'theme-swatch'}
            onClick={() => setUiStyle('orbit')}
          >
            Orbit
          </button>
        </div>

        <h2>AI auto difficulty</h2>
        <p className="subtle" style={{ marginTop: -8 }}>
          When a post-exam reflection doesn't match how you rated a subject and your grades back that up, let
          the AI adjust that subject's difficulty automatically instead of asking you first. Off by default.
        </p>
        <div className="tab-switch" style={{ maxWidth: 240 }}>
          <button
            type="button"
            className={autoAdjustDifficulty ? 'tab active' : 'tab'}
            onClick={() => setAutoAdjustDifficulty(true)}
          >
            On
          </button>
          <button
            type="button"
            className={!autoAdjustDifficulty ? 'tab active' : 'tab'}
            onClick={() => setAutoAdjustDifficulty(false)}
          >
            Off
          </button>
        </div>

        <h2>Profile</h2>
        <form onSubmit={handleSaveProfile} className="auth-form">
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
          </label>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="primary-btn" disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      {showSavedToast && <div className="settings-saved-toast">Changes saved successfully!</div>}
    </div>
  );
}
