import { useState } from 'react';
import { api } from '../api.js';
import CalendarIcon from '../components/CalendarIcon.jsx';

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data =
        mode === 'login'
          ? await api.login(username, password)
          : await api.signup(username, name, password);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="centered-screen">
      <div className="auth-card">
        <div className="brand">
          <CalendarIcon />
          <span className="brand-name">iSchedule</span>
        </div>
        <h1>{mode === 'login' ? 'Welcome back!' : 'Create your account'}</h1>
        <p className="subtle">Track upcoming exams and holidays from your school schedule.</p>

        <div className="tab-switch">
          <button
            type="button"
            className={mode === 'login' ? 'tab active' : 'tab'}
            onClick={() => setMode('login')}
          >
            Log In
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'tab active' : 'tab'}
            onClick={() => setMode('signup')}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </label>

          {mode === 'signup' && (
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          )}

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="primary-btn" disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Sign Up'}
          </button>
        </form>
      </div>
    </div>
  );
}
