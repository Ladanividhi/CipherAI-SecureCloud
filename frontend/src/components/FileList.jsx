import React from 'react';
import StatusPill from './StatusPill';
import { formatBytes, formatDate } from '../utils/formatters';
import { File, FileText, Image as ImageIcon, Music, Video, Code, FileArchive } from 'lucide-react';

const getFileIcon = (filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return <ImageIcon size={24} className="file-icon-img" color="#6366f1" />;
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return <Video size={24} className="file-icon-video" color="#ef4444" />;
  if (['mp3', 'wav', 'ogg'].includes(ext)) return <Music size={24} className="file-icon-audio" color="#10b981" />;
  if (['pdf'].includes(ext)) return <FileText size={24} className="file-icon-pdf" color="#f87171" />;
  if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return <FileText size={24} className="file-icon-doc" color="#3b82f6" />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FileArchive size={24} className="file-icon-archive" color="#eab308" />;
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'html', 'css', 'json'].includes(ext)) return <Code size={24} className="file-icon-code" color="#8b5cf6" />;
  return <File size={24} className="file-icon-generic" color="#9ca3af" />;
};

export default function FileList({
  files,
  onFileSelect,
  selectedFile,
  title = 'My Files',
  emptyMessage = 'No files yet. Upload something to get started.',
  selection = new Set(),
  onToggleSelection,
  onSelectAll
}) {
  const resolvedFiles = Array.isArray(files) ? files : [];
  const allSelected = resolvedFiles.length > 0 && resolvedFiles.every(f => selection.has(f.file_name || f.filename));

  const handleRowClick = (e, file) => {
    // If clicking checkbox area or if holding Shift/Ctrl (optional enhancement), toggle selection
    // But for now, let's make a dedicated checkbox
    onFileSelect(file);
  };

  return (
    <section className="files-section">
      {title ? (
        <div className="files-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {onSelectAll && (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#6366f1', cursor: 'pointer' }}
              />
            )}
            <h2>{title}</h2>
          </div>
          <span className="muted">{resolvedFiles.length} files</span>
        </div>
      ) : null}

      {resolvedFiles.length ? (
        <div className="my-files-list">
          {resolvedFiles.map((file) => {
            const fileName = file.file_name || file.filename;
            const isSelected = selection.has(fileName);

            return (
              <div
                key={file.id || fileName}
                className={`my-file-row ${(selectedFile?.file_name || selectedFile?.filename) === fileName ? 'highlight' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  background: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-panel)',
                  border: isSelected ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent'
                }}
              >
                {onToggleSelection && (
                  <div style={{ display: 'grid', placeItems: 'center', paddingLeft: '8px' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleSelection(fileName);
                      }}
                      style={{ width: '18px', height: '18px', accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onFileSelect(file)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    color: 'inherit',
                    font: 'inherit',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className="file-icon-wrapper" style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.03)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {getFileIcon(fileName)}
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <p style={{ margin: 0, fontWeight: 500 }}>{fileName}</p>
                      <small style={{ display: 'block', marginTop: '4px' }}>
                        {formatDate(file.uploaded_at)} • {formatBytes(file.size ?? file.size_bytes)}
                      </small>
                    </div>
                  </div>
                  <StatusPill status={file.status} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty-state">{emptyMessage}</p>
      )}
    </section>
  );
}
