import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { APK_DOWNLOAD_URL } from '../utils.js';
import CommandBar from '../components/CommandBar.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useBackHandler } from '../hooks/useBackButton.js';

// The old hamburger-menu overlay, now just the fourth tab — Retake Quiz / Change Externals /
// Settings / Log Out / Delete Account / Download App, listed as ledger line items instead of
// hidden behind a drawer.
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
    <div className="dashboard binder-page">
      <CommandBar activeTab={activeTab} onSwitchTab={onSwitchTab} />
      <div className="binder-content">
        <header className="ledger-header">
          <div className="ledger-header-title">More</div>
          <h1>{greeting}</h1>
        </header>

        <div className="ledger-list">
          {entries.map((entry) => (
            <button
              type="button"
              key={entry.label}
              className={entry.danger ? 'ledger-list-row danger' : 'ledger-list-row'}
              onClick={entry.onClick}
            >
              <span className="ledger-list-label">{entry.label}</span>
              {entry.hint && <span className="ledger-list-hint">{entry.hint}</span>}
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
