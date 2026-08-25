import { useState } from 'react';
import { api } from '../api.js';
import BrandIcon from '../components/BrandIcon.jsx';
import PrivacyTerms from './PrivacyTerms.jsx';
import { EyeIcon } from '../components/NavIcons.jsx';

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
    <div className="auth-quiet-page">
      <div className="auth-quiet-blob auth-quiet-blob-a" aria-hidden="true" />
      <div className="auth-quiet-blob auth-quiet-blob-b" aria-hidden="true" />
      <div className="auth-quiet">
        <BrandIcon size={40} />
        <h1 className="auth-quiet-title">Cram</h1>
        <p className="auth-quiet-sub">Your academic life, organized around you.</p>
        <div className="auth-quiet-rule" />

        <div className="auth-quiet-switch">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Log In
          </button>
          <span className="sep">·</span>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-quiet-form">
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
            <label className="checkbox-label auth-quiet-terms">
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
            className="auth-quiet-submit"
            disabled={submitting || (mode === 'signup' && !acceptedTerms)}
          >
            {submitting ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Sign Up'}
          </button>
        </form>
      </div>
    </div>
  );
}
