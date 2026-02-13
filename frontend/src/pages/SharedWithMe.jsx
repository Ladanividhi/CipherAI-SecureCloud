import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Share2, Eye, Download, X, FileText, Image as ImageIcon, Music, Video, Code, FileArchive, File, Clock, User, Maximize2, CalendarPlus } from 'lucide-react';
import { formatBytes, formatDate } from '../utils/formatters';

const getFileIcon = (filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return <ImageIcon size={24} color="#6366f1" />;
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return <Video size={24} color="#ef4444" />;
  if (['mp3', 'wav', 'ogg'].includes(ext)) return <Music size={24} color="#10b981" />;
  if (['pdf'].includes(ext)) return <FileText size={24} color="#f87171" />;
  if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return <FileText size={24} color="#3b82f6" />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FileArchive size={24} color="#eab308" />;
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'html', 'css', 'json'].includes(ext)) return <Code size={24} color="#8b5cf6" />;
  return <File size={24} color="#9ca3af" />;
};

export default function SharedWithMe() {
  const { filesState } = useOutletContext();
  const { authorizedFetch } = filesState;

  const [sharedFiles, setSharedFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Preview state
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewObjectUrl = useRef('');
  const [extendRequesting, setExtendRequesting] = useState(null); // share_id being requested

  const releasePreview = useCallback(() => {
    if (previewObjectUrl.current) {
      URL.revokeObjectURL(previewObjectUrl.current);
      previewObjectUrl.current = '';
    }
  }, []);

  useEffect(() => () => releasePreview(), [releasePreview]);

  // Fetch shared files
  const fetchShared = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authorizedFetch('/files/shared-with-me');
      if (!res.ok) throw new Error('Failed to load shared files');
      const data = await res.json();
      setSharedFiles(Array.isArray(data.files) ? data.files : []);
    } catch {
      setSharedFiles([]);
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    fetchShared();
  }, [fetchShared]);

  // Open shared file preview
  const handleOpenFile = useCallback(async (file) => {
    setPreviewFile(file);
    setPreviewBusy(true);
    setPreviewUrl('');
    releasePreview();

    try {
      const res = await authorizedFetch('/files/shared/decrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ share_id: file.share_id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to decrypt shared file');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      previewObjectUrl.current = url;
      setPreviewUrl(url);
    } catch (err) {
      filesState.setStatus(err.message);
    } finally {
      setPreviewBusy(false);
    }
  }, [authorizedFetch, releasePreview, filesState]);

  // Download shared file
  const handleDownload = useCallback(async (file) => {
    if (file.permissions !== 'download') return;

    try {
      const res = await authorizedFetch(`/files/shared/download/${encodeURIComponent(file.share_id)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      filesState.setStatus(err.message);
    }
  }, [authorizedFetch, filesState]);

  const closePreview = useCallback(() => {
    setPreviewFile(null);
    setPreviewUrl('');
    releasePreview();
  }, [releasePreview]);

  // Request owner to extend expiry on a shared file
  const handleRequestExtend = useCallback(async (shareId, e) => {
    if (e) e.stopPropagation();
    setExtendRequesting(shareId);
    try {
      const res = await authorizedFetch('/files/shared/request-extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ share_id: shareId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to send extend request');
      }
      filesState.setStatus('Extension request sent to the file owner.');
    } catch (err) {
      filesState.setStatus(err.message);
    } finally {
      setExtendRequesting(null);
    }
  }, [authorizedFetch, filesState]);

  // Filter by search
  const normalizedSearch = search.trim().toLowerCase();
  const visibleFiles = normalizedSearch
    ? sharedFiles.filter((f) => {
        const name = (f.file_name || '').toLowerCase();
        const owner = (f.owner_email || '').toLowerCase();
        return name.includes(normalizedSearch) || owner.includes(normalizedSearch);
      })
    : sharedFiles;

  const renderPreviewContent = () => {
    if (!previewUrl) {
      return <span className="shared-preview-loading">Decrypting shared file...</span>;
    }
    const lowerName = (previewFile?.file_name || '').toLowerCase();
    const isPdf = lowerName.endsWith('.pdf');
    const isImage = /(png|jpe?g|gif|webp)$/i.test(lowerName);

    if (isPdf) return (
      <div className="pdf-no-toolbar">
        <iframe src={previewUrl} title={previewFile.file_name} />
      </div>
    );
    if (isImage) return <img src={previewUrl} alt={previewFile.file_name} />;

    return (
      <div className="preview-fallback">
        <p>No inline preview for this format.</p>
        {previewFile?.permissions === 'download' && (
          <button className="primary-btn" type="button" onClick={() => handleDownload(previewFile)}>
            Download
          </button>
        )}
      </div>
    );
  };

  return (
    <main className="main-content">
      <header className="main-header">
        <div>
          <h1>Shared with Me</h1>
          <p>Files other users have shared with you.</p>
        </div>
        <div className="header-actions">
          <input
            type="search"
            placeholder="Search by file or owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      {filesState.status && <div className="status-banner">{filesState.status}</div>}

      {loading ? (
        <p className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>Loading shared files...</p>
      ) : visibleFiles.length === 0 ? (
        <div className="shared-empty">
          <Share2 size={48} color="#4b5563" />
          <h3>No shared files</h3>
          <p className="muted">{normalizedSearch ? 'No files match your search.' : 'No one has shared any files with you yet.'}</p>
        </div>
      ) : (
        <div className="shared-files-grid">
          {visibleFiles.map((file) => (
            <div key={file.share_id} className="shared-file-card" onClick={() => handleOpenFile(file)}>
              <div className="shared-file-card__icon">
                {getFileIcon(file.file_name)}
              </div>
              <div className="shared-file-card__info">
                <p className="shared-file-card__name" title={file.file_name}>{file.file_name}</p>
                <div className="shared-file-card__meta">
                  <span className="shared-file-card__owner">
                    <User size={12} />
                    {file.owner_name || file.owner_email || 'Unknown'}
                  </span>
                  <span className="shared-file-card__size">{formatBytes(file.size)}</span>
                </div>
                {file.createdAt && (
                  <span className="shared-file-card__date">
                    <Clock size={12} />
                    Shared {formatDate(file.createdAt)}
                  </span>
                )}
              </div>
              <div className="shared-file-card__badges">
                <span className={`shared-permission-badge shared-permission-badge--${file.permissions}`}>
                  {file.permissions === 'download' ? (
                    <><Download size={12} /> View & Download</>
                  ) : (
                    <><Eye size={12} /> View Only</>
                  )}
                </span>
                {file.sharedExpiryTime && (
                  <span className="shared-expiry-badge">
                    <Clock size={12} /> Expires {formatDate(file.sharedExpiryTime)}
                  </span>
                )}
                {file.sharedExpiryTime && (
                  <button
                    className="shared-extend-btn"
                    type="button"
                    title="Request owner to extend expiry"
                    disabled={extendRequesting === file.share_id}
                    onClick={(e) => handleRequestExtend(file.share_id, e)}
                  >
                    <CalendarPlus size={12} />
                    {extendRequesting === file.share_id ? 'Sending...' : 'Request Extension'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Shared file preview overlay */}
      {previewFile && (
        <div className="preview-overlay" role="dialog" aria-modal="true" onClick={closePreview}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <header className="preview-modal__header">
              <div>
                <p className="details-title">{previewFile.file_name}</p>
                <small>
                  Shared by {previewFile.owner_name || previewFile.owner_email || 'Unknown'}
                  {' • '}{formatBytes(previewFile.size)}
                  {' • '}
                  <span className={`shared-permission-inline shared-permission-inline--${previewFile.permissions}`}>
                    {previewFile.permissions === 'download' ? 'View & Download' : 'View Only'}
                  </span>
                </small>
              </div>
              <div className="preview-actions">
                {previewUrl && (() => {
                  const ln = (previewFile.file_name || '').toLowerCase();
                  return ln.endsWith('.pdf') || /(png|jpe?g|gif|webp)$/i.test(ln);
                })() && (
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
                {previewFile.permissions === 'download' && (
                  <button
                    className="download-btn"
                    type="button"
                    onClick={() => handleDownload(previewFile)}
                    disabled={previewBusy}
                  >
                    Download
                  </button>
                )}
                {previewFile.sharedExpiryTime && (
                  <button
                    className="shared-extend-btn"
                    type="button"
                    title="Request owner to extend expiry"
                    disabled={extendRequesting === previewFile.share_id}
                    onClick={() => handleRequestExtend(previewFile.share_id)}
                  >
                    <CalendarPlus size={14} />
                    {extendRequesting === previewFile.share_id ? 'Sending...' : 'Request Extension'}
                  </button>
                )}
                <button className="preview-close-btn" type="button" onClick={closePreview}>Close</button>
              </div>
            </header>
            <div className="preview-modal__content">
              <div className={`file-preview ${previewUrl ? 'live' : ''}`}>
                {renderPreviewContent()}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
