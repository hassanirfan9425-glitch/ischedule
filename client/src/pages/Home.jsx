import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { countdownText } from '../utils.js';
import SideTabs from '../components/SideTabs.jsx';

export default function Home({ greeting, activeTab, onSwitchTab }) {
  const [dashboardData, setDashboardData] = useState(null);
  const [academicsData, setAcademicsData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getDashboard(), api.getAcademics()])
      .then(([dash, acad]) => {
        setDashboardData(dash);
        setAcademicsData(acad);
      })
      .finally(() => setLoading(false));
  }, []);

  const upcomingExams = dashboardData
    ? [...dashboardData.periodicExams, ...dashboardData.finalExams]
        .sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0))
        .slice(0, 3)
    : [];

  // Show every term that actually has grades, not just whichever term the schedule says is
  // "current" — that inference can be wrong (or there's no schedule at all yet), and a term with
  // real entries shouldn't just silently not show up here.
  const termsWithGrades = academicsData
    ? academicsData.terms.filter((t) => t.overallAverage !== null).sort((a, b) => a.term - b.term)
    : [];
  // Suggestions, unlike averages, only make sense for the most recent term — showing advice for
  // an old term next to the current one is just noise.
  const latestTermWithGrades = termsWithGrades.length > 0 ? termsWithGrades[termsWithGrades.length - 1] : null;

  return (
    <div className="dashboard binder-page">
      <SideTabs activeTab={activeTab} onSwitchTab={onSwitchTab} />
      <div className="binder-content">
        <header className="ledger-header">
          <div className="ledger-header-title">Home</div>
          <h1>{greeting}</h1>
        </header>

        {loading && (
          <div className="centered-screen">
            <div className="spinner" />
          </div>
        )}

        {!loading && (
          <>
            <button type="button" className="ledger-panel" onClick={() => onSwitchTab('schedule')}>
              <div className="ledger-panel-title">Schedule</div>
              {upcomingExams.length === 0 ? (
                <div className="ledger-panel-empty">No upcoming exams yet. Tap to add your schedule.</div>
              ) : (
                upcomingExams.map((exam) => (
                  <div className="ledger-line-row" key={exam.id}>
                    <span className="ledger-line-label">{exam.subjectLabel}</span>
                    <span className="ledger-line-value">{countdownText(exam.daysUntil)}</span>
                  </div>
                ))
              )}
            </button>

            <button type="button" className="ledger-panel" onClick={() => onSwitchTab('academics')}>
              <div className="ledger-panel-title">Academics</div>
              {termsWithGrades.length === 0 ? (
                <div className="ledger-panel-empty">No grades yet. Tap to add your grade report.</div>
              ) : (
                termsWithGrades.map((t) => (
                  <div className="ledger-line-row" key={t.term}>
                    <span className="ledger-line-label">Term {t.term} average</span>
                    <span className="ledger-line-value ledger-line-value-big">{Math.round(t.overallAverage)}</span>
                  </div>
                ))
              )}
            </button>

            {latestTermWithGrades && latestTermWithGrades.suggestions.length > 0 && (
              <div className="ledger-panel">
                <div className="ledger-panel-title">Suggestions</div>
                <ul className="ledger-suggestions">
                  {latestTermWithGrades.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
