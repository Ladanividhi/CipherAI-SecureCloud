import React from 'react';
import StatusPill from './StatusPill';
import { formatBytes, formatDate } from '../utils/formatters';

export default function PreviewOverlay({ visible, file, previewUrl, status, onDownload, onShare, onClose, busy }) {
  if (!visible || !file) {
    return null;
  }

  const lowerName = (file.file_name || file.filename)?.toLowerCase() || '';
  const isPdf = lowerName.endsWith('.pdf');
  const isImage = /(png|jpe?g|gif|webp)$/i.test(lowerName);

  const renderPreview = () => {
    if (!previewUrl) {
      return <span>Decrypting and preparing preview...</span>;
    }

    if (isPdf) {
      return <iframe src={previewUrl} title={file.file_name || file.filename} />;
    }

    if (isImage) {
      return <img src={previewUrl} alt={file.file_name || file.filename} />;
    }

    return (
      <div className="preview-fallback">
        <p>No inline preview for this format. Download to view.</p>
        <button className="primary-btn" type="button" onClick={onDownload} disabled={busy}>Download</button>
      </div>
    );
  };

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="preview-modal" onClick={(event) => event.stopPropagation()}>
        <header className="preview-modal__header">
          <div>
            <p className="details-title">{file.file_name || file.filename}</p>
            <small>
              Uploaded {formatDate(file.uploaded_at)} • {formatBytes(file.size ?? file.size_bytes)}
            </small>
          </div>
          <div className="preview-actions">
            <button className="share-btn" type="button" onClick={onShare} disabled={busy}>Share</button>
            <button className="download-btn" type="button" onClick={onDownload} disabled={busy}>
              {busy && !previewUrl ? 'Preparing...' : 'Download'}
            </button>
            <button className="preview-close-btn" type="button" onClick={onClose}>Close</button>
          </div>
        </header>
        <div className="preview-modal__content">
          <div className={`file-preview ${previewUrl ? 'live' : ''}`}>{renderPreview()}</div>
          <div className="preview-meta">
            <StatusPill status={file.status} />
            {status && <p className="small-status">{status}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
