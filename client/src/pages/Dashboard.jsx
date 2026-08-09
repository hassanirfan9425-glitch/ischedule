import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ExamBubble from '../components/ExamBubble.jsx';
import HolidayBubble from '../components/HolidayBubble.jsx';
import NavDrawer from '../components/NavDrawer.jsx';
import CalendarIcon from '../components/CalendarIcon.jsx';

function ExamSection({ title, emptyText, exams }) {
  return (
    <section>
      <h2>{title}</h2>
      {exams.length === 0 ? (
        <p className="subtle">{emptyText}</p>
      ) : (
        <div className="bubble-grid exams">
          {exams.map((exam) => (
            <ExamBubble key={exam.id} exam={exam} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Dashboard({ user, onLogout, onReupload, onRetakeQuiz, onSettings, onManualEntry }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    api
      .getDashboard()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Add more entries here any time — the drawer just renders whatever's in this list.
  const navItems = [
    { label: 'Retake Quiz', onClick: onRetakeQuiz },
    { label: 'Update Schedule', onClick: onReupload },
    { label: 'Enter Schedule Manually', onClick: onManualEntry },
    { label: 'Settings', onClick: onSettings },
    { label: 'Log Out', onClick: onLogout },
  ];

  return (
    <div className="dashboard">
      <button
        type="button"
        className="hamburger-btn"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
      >
        ☰
      </button>
      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} items={navItems} />

      <header className="dashboard-header" style={{ paddingLeft: 76 }}>
        <div className="brand" style={{ marginBottom: 0, justifyContent: 'flex-start' }}>
          <CalendarIcon />
          <div>
            <div className="brand-name" style={{ fontSize: '1.1rem' }}>
              iSchedule
            </div>
            <h1 style={{ fontSize: '1.4rem' }}>Hey {user.name}</h1>
          </div>
        </div>
      </header>

      {loading && (
        <div className="centered-screen">
          <div className="spinner" />
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {data && (
        <>
          <ExamSection
            title="Periodic Exams"
            emptyText="No periodic exams coming up yet."
            exams={data.periodicExams}
          />
          <ExamSection
            title="Final Exams"
            emptyText="No final exam periods coming up yet."
            exams={data.finalExams}
          />

          <section>
            <h2>Upcoming Holidays</h2>
            {data.holidays.length === 0 ? (
              <p className="subtle">No upcoming holidays found yet.</p>
            ) : (
              <div className="bubble-grid holidays">
                {data.holidays.map((holiday) => (
                  <HolidayBubble key={holiday.id} holiday={holiday} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <button type="button" className="fab-btn" onClick={onReupload} title="Update your schedule">
        +
      </button>
    </div>
  );
}
