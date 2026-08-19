import { useRef, useState } from 'react';
import { api } from '../api.js';
import CalendarIcon from '../components/CalendarIcon.jsx';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.webp,.gif';

export default function Upload({ onComplete, onCancel, onManualEntry }) {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | analyzing | error
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  function pickFile(f) {
    if (!f) return;
    setFile(f);
    setError('');
  }

  async function pollUntilDone() {
    // The AI pipeline runs in the background on the server (see schedule.js) so this request
    // returns instantly — poll status instead of waiting on one long request, since that's what
    // was hitting Netlify's ~30s proxy timeout in production.
    while (true) {
      const { upload } = await api.getScheduleStatus();
      if (upload?.status === 'done') return;
      if (upload?.status === 'error') {
        throw new Error(upload.error || 'Could not analyze the calendar.');
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  async function handleSubmit() {
    if (!file) return;
    setStatus('analyzing');
    setError('');
    try {
      await api.uploadSchedule(file);
      await pollUntilDone();
      await onComplete();
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  if (status === 'analyzing') {
    return (
      <div className="centered-screen">
        <CalendarIcon size={40} />
        <div className="spinner" style={{ marginTop: 16 }} />
        <p className="subtle" style={{ marginTop: 16, textAlign: 'center', maxWidth: 320 }}>
          Analyzing your calendar. This can take a few minutes while the agent works through the grid…
        </p>
      </div>
    );
  }

  return (
    <div className="centered-screen">
      <div className="upload-card">
        {onCancel && (
          <button type="button" className="back-link" onClick={onCancel}>
            ← Back to dashboard
          </button>
        )}
        <div className="brand">
          <CalendarIcon />
          <span className="brand-name">iCalendar</span>
        </div>
        <h1>Attach your school calendar</h1>
        <p className="subtle">Upload a PDF or image of the school calendar to build your own personalized calendar.</p>

        <div
          className={dragOver ? 'drop-zone drag-over' : 'drop-zone'}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files?.[0]);
          }}
        >
          {file ? (
            <div className="file-chosen">
              <span>{file.name}</span>
            </div>
          ) : (
            <>
              <div className="plus-button">+</div>
              <p className="subtle">Click or drag a PDF / image here</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            hidden
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>

        {error && (
          <>
            <p className="error-text">{error}</p>
            {onManualEntry && (
              <button type="button" className="back-link" onClick={onManualEntry}>
                Enter calendar manually.
              </button>
            )}
          </>
        )}

        <button type="button" className="primary-btn" disabled={!file} onClick={handleSubmit}>
          Analyze Calendar
        </button>
      </div>
    </div>
  );
}
