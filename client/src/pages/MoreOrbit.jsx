import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { APK_DOWNLOAD_URL } from '../utils.js';
import OrbitDial from '../components/OrbitDial.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useBackHandler } from '../hooks/useBackButton.js';

// Account actions (Retake Quiz / Change Externals / Settings / Log Out / Delete Account / Download
// App) — Orbit's dial only carries the 4 top-level tabs, so these live here as the 4th tab, same
// split as Technical's More.jsx, just its own chrome instead of reusing that file's ledger classes.
export default function More({
  user,
  greeting,
  onLogout,
  onRetakeQuiz,
  onEditElectives,
  onSettings,
  onDeleteAccount,
  activeTab,
  onSwitchTab,
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await onDeleteAccount();
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  };

  useBackHandler(confirmingDelete, () => {
    setConfirmingDelete(false);
    setDeleteError('');
  });

  const entries = [
    { label: 'Retake Quiz', hint: 'Redo your subject difficulty ratings', onClick: onRetakeQuiz },
    { label: 'Change Externals', hint: 'Update just your optional subjects', onClick: onEditElectives },
    { label: 'Settings', hint: 'Username, name, color', onClick: onSettings },
    { label: 'Log Out', hint: null, onClick: onLogout },
    { label: 'Delete Account', hint: 'Cannot be undone', onClick: () => setConfirmingDelete(true), danger: true },
    ...(Capacitor.isNativePlatform()
      ? []
      : [{ label: 'Download App', hint: 'Get the Android app', onClick: () => window.open(APK_DOWNLOAD_URL, '_blank') }]),
  ];

  return (
    <div className="dashboard orbit-page">
      <OrbitDial activeTab={activeTab} onSwitchTab={onSwitchTab} />
      <div className="orbit-content">
        <header className="orbit-header">
          <div className="orbit-header-eyebrow">More</div>
          <h1>{greeting}</h1>
        </header>

        <div className="orbit-action-list">
          {entries.map((entry) => (
            <button
              type="button"
              key={entry.label}
              className={entry.danger ? 'orbit-action-row danger' : 'orbit-action-row'}
              onClick={entry.onClick}
            >
              <span className="orbit-action-label">{entry.label}</span>
              {entry.hint && <span className="orbit-action-hint">{entry.hint}</span>}
            </button>
          ))}
        </div>

        {confirmingDelete && (
          <ConfirmDialog
            message="Are you sure you want to delete your account? This cannot be undone."
            confirmLabel="Delete Account"
            danger
            busy={deleting}
            error={deleteError}
            onCancel={() => {
              setConfirmingDelete(false);
              setDeleteError('');
            }}
            onConfirm={handleDeleteAccount}
          />
        )}
      </div>
    </div>
  );
}
