import React from 'react';
import StatusPill from './StatusPill';
import { formatBytes, formatDate } from '../utils/formatters';

function isAdvanceSecurityEnabled(file) {
  if (!file) return true;
  if (typeof file.advance_security === 'boolean') return file.advance_security;
  if (typeof file.advance_seciroty === 'boolean') return file.advance_seciroty;
  return true;
}

function ChatbotDisabledPanel() {
  return (
    <div className="chat-disabled-panel">
      <div className="chat-disabled-panel__header">
        <h4>Assistant</h4>
        <span className="muted">Disabled</span>
      </div>
      <div className="chat-disabled-panel__messages">
        <div className="chat-bubble chat-bubble--assistant">
          Assistant is disabled due to security settings.
        </div>
        <div className="chat-bubble chat-bubble--user">Can you summarize this?</div>
        <div className="chat-bubble chat-bubble--assistant">
          This file is protected. Only you can view it.
        </div>
      </div>
      <div className="chat-disabled-panel__composer">
        <input type="text" disabled value="Assistant disabled due to security settings" />
        <button type="button" disabled className="primary-btn">Send</button>
      </div>
    </div>
  );
}

export default function PreviewOverlay({ visible, file, previewUrl, status, onDownload, onShare, onClose, busy }) {
  if (!visible || !file) {
    return null;
  }

  const advanceSecurityEnabled = isAdvanceSecurityEnabled(file);

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
      <div className={`preview-modal ${advanceSecurityEnabled ? '' : 'preview-modal--split'}`} onClick={(event) => event.stopPropagation()}>
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
          {!advanceSecurityEnabled ? <ChatbotDisabledPanel /> : null}
          <div className="preview-meta">
            <StatusPill status={file.status} />
            {status && <p className="small-status">{status}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
