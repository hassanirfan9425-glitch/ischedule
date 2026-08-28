import { useRef, useState } from 'react';
import { api } from '../api.js';
import BrandIcon from '../components/BrandIcon.jsx';
import FinalExamReview from '../components/FinalExamReview.jsx';
import { useOnlineStatus } from '../offline/connectivity.js';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.webp,.gif';

export default function Upload({ onComplete, onCancel, onManualEntry }) {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | analyzing | error
  const [error, setError] = useState('');
  const [review, setReview] = useState(null); // { uploadId, term, exams } once a final-exam upload needs a look
  const inputRef = useRef(null);
  const isOnline = useOnlineStatus();

  function pickFile(f) {
    if (!f) return;
    setFile(f);
    setError('');
  }

  async function pollUntilDone() {
    // The AI pipeline runs in the background on the server (see schedule.js) so this request
    // returns instantly — poll status instead of waiting on one long request, since that's what
    // was hitting Netlify's ~30s proxy timeout in production. Returns a review descriptor for a
    // final-exam upload that needs a look before it touches the calendar, or null once a general
    // calendar upload has already committed on its own.
    while (true) {
      const { upload } = await api.getScheduleStatus();
      if (upload?.status === 'done') return null;
      if (upload?.status === 'needs_review') {
        return { uploadId: upload.id, term: upload.pendingData.term, exams: upload.pendingData.exams };
      }
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
      const pendingReview = await pollUntilDone();
      if (pendingReview) {
        setReview(pendingReview);
      } else {
        await onComplete();
      }
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  if (review) {
    return (
      <FinalExamReview
        uploadId={review.uploadId}
        term={review.term}
        exams={review.exams}
        onDone={async () => {
          setReview(null);
          await onComplete();
        }}
        onCancel={() => {
          setReview(null);
          setStatus('idle');
          setFile(null);
        }}
      />
    );
  }

  if (status === 'analyzing') {
    return (
      <div className="centered-screen">
        <BrandIcon size={40} />
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
          <BrandIcon />
          <span className="brand-name">Cram</span>
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

        {!isOnline && (
          <>
            <p className="subtle">You're offline. Calendar analysis needs a connection.</p>
            {onManualEntry && (
              <button type="button" className="back-link" onClick={onManualEntry}>
                Enter calendar manually instead.
              </button>
            )}
          </>
        )}

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

        <button type="button" className="primary-btn" disabled={!file || !isOnline} onClick={handleSubmit}>
          Analyze Calendar
        </button>
      </div>
    </div>
  );
}
