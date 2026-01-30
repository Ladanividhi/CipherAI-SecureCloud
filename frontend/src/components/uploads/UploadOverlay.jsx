const destinationFolders = [
  { value: '/My Documents/Work', label: '/My Documents/Work' },
  { value: '/Shared/Finance', label: '/Shared/Finance' },
  { value: '/Clients/Final', label: '/Clients/Final' },
];

const formatBytes = (size) => {
  if (typeof size !== 'number') return '—';
  if (size === 0) return '0 B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
};

export default function UploadOverlay({
  visible,
  onClose,
  onBrowse,
  onUpload,
  busy,
  maxFiles,
  selectedFiles,
  tags,
  applyToAll,
  onApplyToAllChange,
  globalTagId,
  onGlobalTagChange,
  globalExpiry,
  onGlobalExpiryChange,
  globalAdvanceSecurity,
  onGlobalAdvanceSecurityChange,
  securityWarningVisible,
  onCloseSecurityWarning,
  onFileTagChange,
  onFileExpiryChange,
  onFileAdvanceSecurityChange,
  onRemoveFile,
  message,
}) {
  if (!visible) {
    return null;
  }

  const canUpload = selectedFiles.length > 0 && !busy;

  return (
    <div className="upload-overlay" role="dialog" aria-modal="true" aria-label="Upload files">
      <div className="upload-modal">
        <header className="upload-modal__header">
          <div>
            <h3>Upload Files</h3>
            <p>
              Support for PDF, DOCX, PNG, JPG, Zip and many more • Up to {maxFiles} files
            </p>
          </div>
          <button className="ghost-btn" type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </header>

        <div className="upload-modal__body">
          <section className="upload-dropzone" aria-label="File picker">
            <div className="upload-dropzone__icon" />
            <p className="upload-dropzone__title">Drag & drop files here</p>
            <p className="muted">Support for PDF, DOCX, PNG, JPG, Zip and many...</p>
            <button className="primary-btn" type="button" onClick={onBrowse} disabled={busy}>
              Browse files
            </button>
          </section>

          <section className="upload-controls" aria-label="Upload settings">
            <div className="upload-security">
              <div className="upload-security__row">
                <label className="upload-check">
                  <input
                    type="checkbox"
                    checked={Boolean(globalAdvanceSecurity)}
                    onChange={(e) => onGlobalAdvanceSecurityChange(e.target.checked)}
                    disabled={busy}
                  />
                  <span>Advance Security</span>
                </label>
              </div>

              <p className="muted upload-security__hint">
                Advance Security is enabled by default for all selected files.
              </p>
            </div>

            <div className="upload-controls__row">
              <label className="upload-field">
                <span className="upload-field__label">Tag</span>
                <select
                  value={globalTagId}
                  onChange={(e) => onGlobalTagChange(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Select a tag</option>
                  {tags.map((tag) => (
                    <option key={tag.tag_id} value={tag.tag_id}>
                      {tag.tag_name || tag.tag_id}
                    </option>
                  ))}
                </select>
                <span className="upload-field__hint">Optional</span>
              </label>

              <label className="upload-field">
                <span className="upload-field__label">Expiry time</span>
                <input
                  type="datetime-local"
                  value={globalExpiry}
                  onChange={(e) => onGlobalExpiryChange(e.target.value)}
                  disabled={busy}
                />
                <span className="upload-field__hint">Optional</span>
              </label>
            </div>

            <label className="upload-apply">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => onApplyToAllChange(e.target.checked)}
                disabled={busy}
              />
              <span>Apply to All</span>
            </label>
          </section>

          {message ? <div className="upload-message">{message}</div> : null}

          <section className="upload-selected" aria-label="Selected files">
            <div className="upload-selected__header">
              <h4>Selected Files ({selectedFiles.length})</h4>
              <p className="muted">Tag and expiry are optional. You can also configure Advance Security per file.</p>
            </div>

            {selectedFiles.length ? (
              <div className="upload-selected__list">
                {selectedFiles.map((item) => (
                  <div key={item.id} className="upload-file-card">
                    <button
                      className="upload-file-card__remove"
                      type="button"
                      onClick={() => onRemoveFile(item.id)}
                      disabled={busy}
                      aria-label={`Remove ${item.file.name}`}
                      title="Remove"
                    >
                      ×
                    </button>

                    <div className="upload-file-card__meta">
                      <div className="upload-file-card__icon" aria-hidden="true" />
                      <div>
                        <p className="upload-file-card__name">{item.file.name}</p>
                        <p className="upload-file-card__info">{formatBytes(item.file.size)}</p>
                      </div>
                    </div>

                    <div className="upload-file-card__controls">
                      <label className="upload-field">
                        <span className="upload-field__label">Tag</span>
                        <select
                          value={item.tagId}
                          onChange={(e) => onFileTagChange(item.id, e.target.value)}
                          disabled={busy}
                        >
                          <option value="">Select a tag</option>
                          {tags.map((tag) => (
                            <option key={tag.tag_id} value={tag.tag_id}>
                              {tag.tag_name || tag.tag_id}
                            </option>
                          ))}
                        </select>
                        <span className="upload-field__hint">Optional</span>
                      </label>

                      <label className="upload-field">
                        <span className="upload-field__label">Expiry</span>
                        <input
                          type="datetime-local"
                          value={item.expiry}
                          onChange={(e) => onFileExpiryChange(item.id, e.target.value)}
                          disabled={busy}
                        />
                        <span className="upload-field__hint">Optional</span>
                      </label>

                      <label className="upload-check upload-check--full">
                        <input
                          type="checkbox"
                          checked={Boolean(item.advance_security)}
                          onChange={(e) => onFileAdvanceSecurityChange(item.id, e.target.checked)}
                          disabled={busy}
                        />
                        <span>Advance Security</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No files selected yet. Click “Browse files” to add up to {maxFiles} files.</p>
            )}
          </section>
        </div>

        <footer className="upload-modal__footer">
          <div />
          <div className="upload-footer-actions">
            <button className="ghost-btn" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="primary-btn" type="button" onClick={onUpload} disabled={!canUpload}>
              {busy ? 'Uploading…' : 'Upload Files →'}
            </button>
          </div>
        </footer>
      </div>

      {securityWarningVisible ? (
        <div className="security-warning-overlay" role="dialog" aria-modal="true" aria-label="Advance security warning">
          <div className="security-warning-modal">
            <h4>Advance Security Disabled</h4>
            <p>
              Now no one will be able to view your file except you. You will also not be allowed to use chatbot
              features for this file.
            </p>
            <div className="security-warning-actions">
              <button className="primary-btn" type="button" onClick={onCloseSecurityWarning}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
