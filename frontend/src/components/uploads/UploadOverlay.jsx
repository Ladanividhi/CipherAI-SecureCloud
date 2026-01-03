const destinationFolders = [
  { value: '/My Documents/Work', label: '/My Documents/Work' },
  { value: '/Shared/Finance', label: '/Shared/Finance' },
  { value: '/Clients/Final', label: '/Clients/Final' },
];

const mockUploads = [
  {
    id: 'contract',
    name: 'contract_final.pdf',
    size: '2.4MB',
    progress: 65,
    status: 'Encrypting…',
    badge: 'Encrypting',
    note: 'Estimating time remaining…',
    tags: ['Generating tags…'],
  },
  {
    id: 'chart',
    name: 'Q3_financial_chart.png',
    size: '1.8MB',
    progress: 100,
    status: 'Ready to upload',
    badge: 'Encrypted',
    note: 'Ready to upload',
    tags: ['Financial', 'Report', '2023', 'Add +'],
  },
];

function UploadItem({ file }) {
  return (
    <div className="upload-item">
      <div className="upload-item__meta">
        <div className="upload-item__icon" />
        <div>
          <p className="upload-item__name">{file.name}</p>
          <p className="upload-item__info">
            {file.size} • {file.note}
          </p>
        </div>
        <span className={`upload-item__badge ${file.badge === 'Encrypted' ? 'badge-success' : ''}`}>
          {file.badge}
        </span>
      </div>
      <div className="upload-progress">
        <div style={{ width: `${file.progress}%` }} />
      </div>
      <div className="upload-item__footer">
        <span>{file.status}</span>
        <div className="upload-tags">
          {file.tags.map((tag) => (
            <span key={`${file.id}-${tag}`}>{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function UploadOverlay({ visible, onClose, onBrowse }) {
  if (!visible) {
    return null;
  }

  return (
    <div className="upload-overlay">
      <div className="upload-modal">
        <header className="upload-modal__header">
          <div>
            <h3>Upload Files</h3>
            <p>Support for PDF, DOCX, PNG, JPG (Max 50MB)</p>
          </div>
          <button className="ghost-btn" type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <section className="upload-dropzone">
          <div className="upload-dropzone__icon" />
          <p className="upload-dropzone__title">Drag & drop files here</p>
          <p className="muted">Support for PDF, DOCX, PNG, JPG (Max 50MB)</p>
          <button className="primary-btn" type="button" onClick={onBrowse}>
            Browse files
          </button>
        </section>
        <section className="upload-destination">
          <span>Destination Folder</span>
          <div className="destination-select">
            <span role="img" aria-label="folder">
              📁
            </span>
            <select defaultValue={destinationFolders[0].value}>
              {destinationFolders.map((folder) => (
                <option key={folder.value} value={folder.value}>
                  {folder.label}
                </option>
              ))}
            </select>
          </div>
        </section>
        <section className="upload-active">
          <div className="upload-active__header">
            <h4>Active Uploads ({mockUploads.length})</h4>
            <button className="ghost-btn" type="button">
              Clear All
            </button>
          </div>
          <div className="upload-list">
            {mockUploads.map((file) => (
              <UploadItem key={file.id} file={file} />
            ))}
          </div>
        </section>
        <footer className="upload-modal__footer">
          <div>
            <p className="muted">Saving to: {destinationFolders[0].label}</p>
          </div>
          <div className="upload-footer-actions">
            <button className="ghost-btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-btn" type="button">
              Upload {mockUploads.length} Files →
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
