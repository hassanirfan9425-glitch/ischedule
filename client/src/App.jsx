import { useEffect, useState } from 'react';
import { api } from './api.js';
import AuthPage from './pages/AuthPage.jsx';
import Quiz from './pages/Quiz.jsx';
import Upload from './pages/Upload.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Academics from './pages/Academics.jsx';
import Home from './pages/Home.jsx';
import Settings from './pages/Settings.jsx';
import ManualEntry from './pages/ManualEntry.jsx';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'schedule' | 'academics'
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
    document.documentElement.setAttribute('data-theme', user?.theme || 'purple_pink');
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
        onCancel={() => setViewingManualEntry(false)}
      />
    );
  }

  // The quiz is the only mandatory onboarding step — schedule and academics are both optional,
  // reachable via their own "+" prompts once the student's in the main app.
  if (!user.onboarded) {
    return (
      <Quiz
        onComplete={async () => {
          const data = await api.me();
          setUser(data.user);
        }}
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

  const sharedProps = {
    user,
    activeTab,
    onSwitchTab: setActiveTab,
    onLogout: async () => {
      await api.logout();
      setUser(null);
      setActiveTab('home');
    },
    onReupload: () => setReuploading(true),
    onRetakeQuiz: () => setRetakingQuiz(true),
    onSettings: () => setViewingSettings(true),
    onManualEntry: () => setViewingManualEntry(true),
    onDeleteAccount: async () => {
      await api.deleteAccount();
      setUser(null);
      setActiveTab('home');
    },
  };

  if (activeTab === 'academics') return <Academics {...sharedProps} />;
  if (activeTab === 'schedule') return <Dashboard {...sharedProps} />;
  return <Home {...sharedProps} />;
}
