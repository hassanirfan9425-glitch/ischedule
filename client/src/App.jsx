import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { api } from './api.js';
import { pickGreetingTemplate } from './utils.js';
import { hasBackHandler, popBackHandler, useBackHandler } from './hooks/useBackButton.js';
import { useTutorial } from './hooks/useTutorial.js';
import AuthPage from './pages/AuthPage.jsx';
import Quiz from './pages/Quiz.jsx';
import Upload from './pages/Upload.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Academics from './pages/Academics.jsx';
import Home from './pages/Home.jsx';
import Settings from './pages/Settings.jsx';
import ManualEntry from './pages/ManualEntry.jsx';
import Electives from './pages/Electives.jsx';
import More from './pages/More.jsx';
import MoreOrbit from './pages/MoreOrbit.jsx';
import TutorialOverlay from './components/TutorialOverlay.jsx';
import OfflineBanner from './components/OfflineBanner.jsx';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [wakingUp, setWakingUp] = useState(false);
  const [user, setUser] = useState(null);
  // Set only when the initial session came from the offline cache (api.js's request() falls back
  // to a cached /auth/me response when the network is genuinely unreachable). OfflineBanner reacts
  // live to connectivity changes on its own; this just supplies the "since when" timestamp.
  const [cachedSessionAt, setCachedSessionAt] = useState(null);
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

  // First-time tutorial: `tutorialSeen` starts false only for brand-new signups (see server/src/
  // routes/auth.js). The "driven" tour only ever runs once onboarding is done — the quiz has its
  // own separate, non-blocking companion cards (see Quiz.jsx's `tutorialActive` prop). Classic-only
  // by design (its steps target Classic-specific DOM like the hamburger drawer) — every new signup
  // defaults to Classic, but nothing stops a test/API-driven account from switching UI style before
  // finishing the tour, so this guards against the tutorial overlay rendering over Technical/Orbit.
  // manualTutorialRestart lets an already-onboarded user re-run the tour from the "Restart
  // Tutorial" menu item, independent of the one-time tutorialSeen flag.
  const [manualTutorialRestart, setManualTutorialRestart] = useState(false);
  const tutorialDriven = Boolean(
    user && user.onboarded && (!user.tutorialSeen || manualTutorialRestart) && user.uiStyle === 'classic'
  );
  const tutorial = useTutorial(tutorialDriven, { onSwitchTab: setActiveTab, setViewingSettings });
  useBackHandler(tutorialDriven, tutorial.back);

  async function handleFinishTutorial() {
    const data = await api.completeTutorial();
    setUser(data.user);
    setManualTutorialRestart(false);
  }

  useEffect(() => {
    // Render's free tier can take 50+ seconds to cold-start after spinning down from inactivity
    // (confirmed via its own dashboard warning), and the keep-alive ping doesn't reliably prevent
    // that. A single quick retry only covers a transient blip, not a real cold start, so this
    // backs off across several attempts before giving up. A 401 means the session genuinely
    // doesn't exist — retrying that would just delay showing the login page for no reason, so
    // only network/gateway-type failures (no status, or 5xx) get retried.
    const RETRY_DELAYS_MS = [1500, 3000, 6000, 10000, 15000, 15000];
    // Measured live against the production endpoint (studycram.vercel.app/api/auth/me) while
    // warm: consistently ~370-400ms, occasionally ~800ms — the 2x-normal-load-time threshold that
    // math implied (~1.2s) turned out to fire too early in practice, so this is a fixed 3s floor
    // instead. Tied to elapsed time, not retry count, so a single slow-but-eventually-successful
    // request also gets the message, not just the multi-retry cold-start case.
    const WAKING_UP_THRESHOLD_MS = 3000;
    let cancelled = false;
    let resolved = false;

    const wakingUpTimer = setTimeout(() => {
      if (!resolved) setWakingUp(true);
    }, WAKING_UP_THRESHOLD_MS);

    async function checkSession() {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          const data = await api.me();
          if (!cancelled) {
            setUser(data.user);
            setCachedSessionAt(data._offline ? data._offline.cachedAt : null);
          }
          return;
        } catch (err) {
          if (err.status === 401 || attempt === RETRY_DELAYS_MS.length || cancelled) return;
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        }
      }
    }

    checkSession().finally(() => {
      resolved = true;
      clearTimeout(wakingUpTimer);
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
      resolved = true;
      clearTimeout(wakingUpTimer);
    };
  }, []);

  useEffect(() => {
    if (user && !greetingTemplate) setGreetingTemplate(() => pickGreetingTemplate());
  }, [user, greetingTemplate]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', user?.theme || 'terracotta');
  }, [user?.theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-ui-style', user?.uiStyle || 'classic');
  }, [user?.uiStyle]);

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
        {wakingUp && <p className="loading-wake-message">Waking up the server, this can take a moment…</p>}
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuth={setUser} />;
  }

  let content;

  if (viewingManualEntry) {
    content = (
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
  } else if (!user.onboarded) {
    // The quiz is the only mandatory onboarding step — schedule and academics are both optional,
    // reachable via their own "+" prompts once the student's in the main app.
    content = (
      <Quiz
        tutorialActive={!user.tutorialSeen}
        onSkipTutorial={handleFinishTutorial}
        onComplete={async () => {
          const data = await api.me();
          setUser(data.user);
        }}
      />
    );
  } else if (reuploading) {
    content = (
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
  } else if (retakingQuiz) {
    content = <Quiz retake onComplete={() => setRetakingQuiz(false)} />;
  } else if (viewingElectives) {
    content = <Electives onDone={() => setViewingElectives(false)} onCancel={() => setViewingElectives(false)} />;
  } else {
    const tutorialOverlay = tutorialDriven && (
      <TutorialOverlay
        step={tutorial.currentStep}
        stepIndex={tutorial.stepIndex}
        totalSteps={tutorial.totalSteps}
        isFirst={tutorial.isFirst}
        onNext={tutorial.next}
        onBack={tutorial.back}
        onFinish={handleFinishTutorial}
        onSkip={handleFinishTutorial}
      />
    );

    if (viewingSettings) {
      content = (
        <>
          <Settings user={user} onBack={() => setViewingSettings(false)} onUserUpdated={setUser} />
          {tutorialOverlay}
        </>
      );
    } else {
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
          // The tutorial's stepIndex lives in a hook here in App.jsx, which never unmounts across a
          // logout/login cycle in this SPA — without resetting it, a tab that ran the tour to (or
          // near) completion on one account would show the tail end of it immediately for the next
          // account signed into in the same tab, instead of starting over from step 1.
          tutorial.restart();
          setManualTutorialRestart(false);
        },
        onReupload: () => setReuploading(true),
        onRetakeQuiz: () => setRetakingQuiz(true),
        onEditElectives: () => setViewingElectives(true),
        onSettings: () => setViewingSettings(true),
        onRestartTutorial: () => {
          tutorial.restart();
          setManualTutorialRestart(true);
        },
        onManualEntry: () => setViewingManualEntry(true),
        onDeleteAccount: async () => {
          await api.deleteAccount();
          setUser(null);
          setGreetingTemplate(null);
          setActiveTab('home');
          tutorial.restart();
          setManualTutorialRestart(false);
        },
      };

      let page;
      if (activeTab === 'academics') page = <Academics {...sharedProps} />;
      else if (activeTab === 'schedule') page = <Dashboard {...sharedProps} />;
      // 'more' only exists for the two nav paradigms that don't have their own drawer/dial slot for
      // account actions — Classic uses its hamburger drawer instead, so a mid-session switch to
      // Classic while parked on 'more' falls back to Home rather than rendering this page under
      // Classic tokens.
      else if (activeTab === 'more' && user.uiStyle === 'technical') page = <More {...sharedProps} />;
      else if (activeTab === 'more' && user.uiStyle === 'orbit') page = <MoreOrbit {...sharedProps} />;
      else {
        page = (
          <Home
            {...sharedProps}
            forceDrawerOpen={tutorialDriven && tutorial.forceDrawerOpen}
            drawerHighlightLabel={tutorialDriven ? tutorial.drawerHighlightLabel : null}
          />
        );
      }

      content = (
        <>
          {page}
          {tutorialOverlay}
        </>
      );
    }
  }

  return (
    <>
      <OfflineBanner cachedAt={cachedSessionAt} />
      {content}
    </>
  );
}
