import { useEffect, useState } from 'react';
import { api } from '../api.js';
import CalendarIcon from '../components/CalendarIcon.jsx';

export default function Settings({ user, onBack, onUserUpdated }) {
  const [themes, setThemes] = useState([]);
  const [username, setUsername] = useState(user.username);
  const [name, setName] = useState(user.name);
  const [theme, setTheme] = useState(user.theme);
  const [error, setError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    api
      .getThemes()
      .then((data) => setThemes(data.themes))
      .catch((err) => setError(err.message));
  }, []);

  async function handleThemePick(nextTheme) {
    setTheme(nextTheme);
    try {
      const data = await api.updateProfile({ theme: nextTheme });
      onUserUpdated(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setError('');
    setSavingProfile(true);
    try {
      const data = await api.updateProfile({ username, name });
      onUserUpdated(data.user);
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
          <span className="brand-name">iSchedule</span>
        </div>
        <h1>Settings</h1>

        <h2 style={{ marginTop: 20 }}>Color theme</h2>
        <div className="theme-picker">
          {themes.map((t) => (
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
    </div>
  );
}
