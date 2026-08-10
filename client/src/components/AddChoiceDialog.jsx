export default function AddChoiceDialog({ message, onChooseAuto, onChooseManual, onCancel }) {
  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className="confirm-dialog material-choice-dialog" onClick={(e) => e.stopPropagation()}>
        <p>{message}</p>
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
