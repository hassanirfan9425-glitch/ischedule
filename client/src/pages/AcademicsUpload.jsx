import { useRef, useState } from 'react';
import { api } from '../api.js';
import CalendarIcon from '../components/CalendarIcon.jsx';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.webp,.gif';

export default function AcademicsUpload({ onComplete, onCancel }) {
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

  async function handleSubmit() {
    if (!file) return;
    setStatus('analyzing');
    setError('');
    try {
      const result = await api.uploadGrades(file);
      await onComplete(result);
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
          Reading your grade report, pulling out every entry…
        </p>
      </div>
    );
  }

  return (
    <div className="centered-screen">
      <div className="upload-card">
        <button type="button" className="back-link" onClick={onCancel}>
          ← Back to dashboard
        </button>
        <div className="brand">
          <CalendarIcon />
          <span className="brand-name">iGrade</span>
        </div>
        <h1>Attach your grade report</h1>
        <p className="subtle">
          Upload a photo or PDF of your grades. This gets added to your current term automatically.
        </p>

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

        {error && <p className="error-text">{error}</p>}

        <button type="button" className="primary-btn" disabled={!file} onClick={handleSubmit}>
          Analyze Grades
        </button>
      </div>
    </div>
  );
}
