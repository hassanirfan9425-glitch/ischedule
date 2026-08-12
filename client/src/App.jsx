import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { api } from './api.js';
import { pickGreetingTemplate } from './utils.js';
import { hasBackHandler, popBackHandler } from './hooks/useBackButton.js';
import AuthPage from './pages/AuthPage.jsx';
import Quiz from './pages/Quiz.jsx';
import Upload from './pages/Upload.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Academics from './pages/Academics.jsx';
import Home from './pages/Home.jsx';
import Settings from './pages/Settings.jsx';
import ManualEntry from './pages/ManualEntry.jsx';
import Electives from './pages/Electives.jsx';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'schedule' | 'academics'
  const [reuploading, setReuploading] = useState(false);
  const [retakingQuiz, setRetakingQuiz] = useState(false);
  const [viewingSettings, setViewingSettings] = useState(false);
  const [viewingManualEntry, setViewingManualEntry] = useState(false);
  const [viewingElectives, setViewingElectives] = useState(false);
  // The phrase itself is picked once per app load (here, not inside each page) so switching tabs
  // never re-rolls it — the guard means it's only ever chosen the first time a user becomes
  // available, cleared on logout so a fresh login picks a new one. The name is deliberately NOT
  // baked in here: greetingTemplate is applied to user.name at render time below, so renaming the
  // account in Settings updates the greeting immediately without picking a new phrase.
  const [greetingTemplate, setGreetingTemplate] = useState(null);

  useEffect(() => {
    api
      .me()
      .then((data) => setUser(data.user))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user && !greetingTemplate) setGreetingTemplate(() => pickGreetingTemplate());
  }, [user, greetingTemplate]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', user?.theme || 'purple_pink');
  }, [user?.theme]);

  // Only relevant inside the wrapped Android app — a plain browser tab has no hardware back button.
  // Without this, Capacitor's default behavior is to exit the app immediately on back, with no
  // concept of the in-app navigation state above. Overlays (drawers, dialogs, sub-views owned by
  // individual pages) get first claim via the shared stack; otherwise back steps out of whichever
  // top-level view is open, then out of a non-home tab, and only exits the app from Home itself.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const listenerPromise = CapacitorApp.addListener('backButton', () => {
      if (hasBackHandler()) {
        popBackHandler();
        return;
      }
      if (viewingManualEntry) {
        setViewingManualEntry(false);
        return;
      }
      if (reuploading) {
        setReuploading(false);
        return;
      }
      if (retakingQuiz) {
        setRetakingQuiz(false);
        return;
      }
      if (viewingElectives) {
        setViewingElectives(false);
        return;
      }
      if (viewingSettings) {
        setViewingSettings(false);
        return;
      }
      if (activeTab !== 'home') {
        setActiveTab('home');
        return;
      }
      CapacitorApp.exitApp();
    });
    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, [viewingManualEntry, reuploading, retakingQuiz, viewingElectives, viewingSettings, activeTab]);

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

  if (viewingElectives) {
    return <Electives onDone={() => setViewingElectives(false)} onCancel={() => setViewingElectives(false)} />;
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
    greeting: greetingTemplate ? greetingTemplate(user.name) : '',
    activeTab,
    onSwitchTab: setActiveTab,
    onLogout: async () => {
      await api.logout();
      setUser(null);
      setGreetingTemplate(null);
      setActiveTab('home');
    },
    onReupload: () => setReuploading(true),
    onRetakeQuiz: () => setRetakingQuiz(true),
    onEditElectives: () => setViewingElectives(true),
    onSettings: () => setViewingSettings(true),
    onManualEntry: () => setViewingManualEntry(true),
    onDeleteAccount: async () => {
      await api.deleteAccount();
      setUser(null);
      setGreetingTemplate(null);
      setActiveTab('home');
    },
  };

  if (activeTab === 'academics') return <Academics {...sharedProps} />;
  if (activeTab === 'schedule') return <Dashboard {...sharedProps} />;
  return <Home {...sharedProps} />;
}
