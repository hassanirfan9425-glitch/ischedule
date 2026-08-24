import { useState } from 'react';
import { api } from '../api.js';
import BrandIcon from '../components/BrandIcon.jsx';
import PrivacyTerms from './PrivacyTerms.jsx';
import { EyeIcon } from '../components/NavIcons.jsx';

const FEATURES = [
  'Gives an organized schedule personalized for you',
  'Get a rough calculation of your average at any time',
  'Receive real advice based off your performance',
];

function FeatureCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="7" fill="var(--brand-500)" />
      <path d="M4 7.2L6 9.2L10 4.8" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [viewingPolicy, setViewingPolicy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data =
        mode === 'login'
          ? await api.login(username, password)
          : await api.signup(username, name, password, acceptedTerms);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (viewingPolicy) {
    return <PrivacyTerms onBack={() => setViewingPolicy(false)} />;
  }

  return (
    <div className="centered-screen">
      <div className="auth-card">
        <div className="brand">
          <BrandIcon />
          <span className="brand-name">Cram</span>
        </div>
        <h1>{mode === 'login' ? 'Welcome back!' : 'Create your account'}</h1>
        <p className="subtle">Your academic life, organized around you.</p>

        <ul className="auth-features">
          {FEATURES.map((feature) => (
            <li key={feature}>
              <FeatureCheck />
              {feature}
            </li>
          ))}
        </ul>

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
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>
          </label>

          {mode === 'signup' && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
              />
              I have read and agree to the{' '}
              <button type="button" className="back-link" onClick={() => setViewingPolicy(true)}>
                Privacy Policy &amp; Terms
              </button>
            </label>
          )}

          {error && <p className="error-text">{error}</p>}

          <button
            type="submit"
            className="primary-btn"
            disabled={submitting || (mode === 'signup' && !acceptedTerms)}
          >
            {submitting ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Sign Up'}
          </button>
        </form>
      </div>
    </div>
  );
}
