import { useEffect, useState } from 'react';
import { api } from './api.js';
import AuthPage from './pages/AuthPage.jsx';
import Quiz from './pages/Quiz.jsx';
import Upload from './pages/Upload.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Settings from './pages/Settings.jsx';
import ManualEntry from './pages/ManualEntry.jsx';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [onboardStage, setOnboardStage] = useState('quiz'); // 'quiz' | 'upload'
  const [reuploading, setReuploading] = useState(false);
  const [retakingQuiz, setRetakingQuiz] = useState(false);
  const [viewingSettings, setViewingSettings] = useState(false);
  const [viewingManualEntry, setViewingManualEntry] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((data) => setUser(data.user))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', user?.theme || 'green');
  }, [user?.theme]);

  if (loading) {
    return (
      <div className="centered-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuth={setUser} />;
  }

  if (viewingManualEntry) {
    return (
      <ManualEntry
        onDone={async () => {
          const data = await api.me();
          setUser(data.user);
          setViewingManualEntry(false);
          setReuploading(false);
        }}
        onCancel={user.onboarded ? () => setViewingManualEntry(false) : undefined}
      />
    );
  }

  if (!user.onboarded) {
    if (onboardStage === 'quiz') {
      return <Quiz onComplete={() => setOnboardStage('upload')} />;
    }
    return (
      <Upload
        onComplete={async () => {
          const data = await api.me();
          setUser(data.user);
        }}
        onManualEntry={() => setViewingManualEntry(true)}
      />
    );
  }

  if (reuploading) {
    return (
      <Upload
        onComplete={async () => {
          const data = await api.me();
          setUser(data.user);
          setReuploading(false);
        }}
        onCancel={() => setReuploading(false)}
        onManualEntry={() => setViewingManualEntry(true)}
      />
    );
  }

  if (retakingQuiz) {
    return <Quiz retake onComplete={() => setRetakingQuiz(false)} />;
  }

  if (viewingSettings) {
    return (
      <Settings
        user={user}
        onBack={() => setViewingSettings(false)}
        onUserUpdated={setUser}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      onLogout={async () => {
        await api.logout();
        setUser(null);
        setOnboardStage('quiz');
      }}
      onReupload={() => setReuploading(true)}
      onRetakeQuiz={() => setRetakingQuiz(true)}
      onSettings={() => setViewingSettings(true)}
      onManualEntry={() => setViewingManualEntry(true)}
    />
  );
}
