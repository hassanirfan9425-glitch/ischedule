export default function MaterialChoiceDialog({ exam, onChooseAuto, onChooseManual, onCancel }) {
  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className="confirm-dialog material-choice-dialog" onClick={(e) => e.stopPropagation()}>
        <p>How would you like to add material for {exam.subjectLabel}?</p>
        <div className="confirm-actions material-choice-actions">
          <button type="button" className="primary-btn" onClick={onChooseAuto}>
            Add Automatically
          </button>
          <button type="button" className="secondary-btn" onClick={onChooseManual}>
            Add Manually
          </button>
        </div>
        <button type="button" className="back-link material-choice-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
