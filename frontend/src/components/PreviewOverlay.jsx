import React, { useState } from 'react';
import { Maximize2, Clock, CalendarPlus, X as XIcon } from 'lucide-react';
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

export default function PreviewOverlay({ visible, file, previewUrl, status, onDownload, onShare, onClose, busy, onExtendExpiry, onRemoveExpiry }) {
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [expiryUpdating, setExpiryUpdating] = useState(false);

  if (!visible || !file) {
    return null;
  }

  const advanceSecurityEnabled = isAdvanceSecurityEnabled(file);

  const lowerName = (file.file_name || file.filename)?.toLowerCase() || '';
  const isPdf = lowerName.endsWith('.pdf');
  const isImage = /(png|jpe?g|gif|webp)$/i.test(lowerName);

  const hasExpiry = Boolean(file.expiry_time);
  const expiryDate = file.expiry_time ? new Date(file.expiry_time) : null;
  const isExpiringSoon = expiryDate && (expiryDate - new Date()) < 24 * 60 * 60 * 1000 && expiryDate > new Date();
  const isExpired = expiryDate && expiryDate <= new Date();

  const handleExtendSubmit = async () => {
    if (!newExpiryDate || !onExtendExpiry) return;
    setExpiryUpdating(true);
    try {
      await onExtendExpiry(file.file_name || file.filename, new Date(newExpiryDate).toISOString());
      setShowExpiryModal(false);
      setNewExpiryDate('');
    } catch { /* handled by parent */ }
    finally { setExpiryUpdating(false); }
  };

  const handleRemoveExpiry = async () => {
    if (!onRemoveExpiry) return;
    setExpiryUpdating(true);
    try {
      await onRemoveExpiry(file.file_name || file.filename);
      setShowExpiryModal(false);
    } catch { /* handled by parent */ }
    finally { setExpiryUpdating(false); }
  };

  const renderPreview = () => {
    if (!previewUrl) {
      return <span>Decrypting and preparing preview...</span>;
    }

    if (isPdf) {
      return (
        <div className="pdf-no-toolbar">
          <iframe src={previewUrl} title={file.file_name || file.filename} />
        </div>
      );
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
            {previewUrl && (isPdf || isImage) && (
              <button
                className="fullpreview-btn"
                type="button"
                title="Full Preview"
                onClick={() => window.open(previewUrl, '_blank')}
              >
                <Maximize2 size={16} style={{ marginRight: '6px' }} />
                Full Preview
              </button>
            )}
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
            {/* Expiry Badge */}
            {hasExpiry && (
              <div className={`expiry-badge ${isExpiringSoon ? 'expiry-badge--warning' : ''} ${isExpired ? 'expiry-badge--expired' : ''}`}>
                <Clock size={14} />
                <span>
                  {isExpired
                    ? 'Expired'
                    : `Expires ${formatDate(file.expiry_time)}`}
                </span>
                {onExtendExpiry && (
                  <button
                    className="expiry-badge__extend-btn"
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowExpiryModal(true); }}
                    title="Extend or modify expiry"
                  >
                    <CalendarPlus size={14} />
                    Extend
                  </button>
                )}
              </div>
            )}
            {!hasExpiry && onExtendExpiry && (
              <button
                className="expiry-set-btn"
                type="button"
                onClick={() => setShowExpiryModal(true)}
                title="Set an expiry time"
              >
                <Clock size={14} />
                Set Expiry
              </button>
            )}
            {status && <p className="small-status">{status}</p>}
          </div>
        </div>

        {/* Expiry Extension Modal */}
        {showExpiryModal && (
          <div className="expiry-modal-overlay" onClick={(e) => { e.stopPropagation(); setShowExpiryModal(false); }}>
            <div className="expiry-modal" onClick={(e) => e.stopPropagation()}>
              <div className="expiry-modal__header">
                <h4>{hasExpiry ? 'Extend Expiry Time' : 'Set Expiry Time'}</h4>
                <button type="button" onClick={() => setShowExpiryModal(false)} className="expiry-modal__close">
                  <XIcon size={18} />
                </button>
              </div>
              {hasExpiry && (
                <p className="expiry-modal__current">
                  Current expiry: <strong>{formatDate(file.expiry_time)}</strong>
                </p>
              )}
              <label className="expiry-modal__label">
                <span>New expiry date & time</span>
                <input
                  type="datetime-local"
                  value={newExpiryDate}
                  onChange={(e) => setNewExpiryDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="expiry-modal__input"
                />
              </label>
              <div className="expiry-modal__actions">
                {hasExpiry && onRemoveExpiry && (
                  <button
                    type="button"
                    className="expiry-modal__remove-btn"
                    onClick={handleRemoveExpiry}
                    disabled={expiryUpdating}
                  >
                    Remove Expiry
                  </button>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
                  <button type="button" className="preview-close-btn" onClick={() => setShowExpiryModal(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleExtendSubmit}
                    disabled={!newExpiryDate || expiryUpdating}
                  >
                    {expiryUpdating ? 'Saving...' : hasExpiry ? 'Extend' : 'Set Expiry'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
