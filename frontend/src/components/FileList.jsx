import React from 'react';
import StatusPill from './StatusPill';
import { formatBytes, formatDate } from '../utils/formatters';

export default function FileList({ files, onFileSelect, selectedFile, title = 'My Files', emptyMessage = 'No files yet. Upload something to get started.' }) {
  const resolvedFiles = Array.isArray(files) ? files : [];
  return (
    <section className="files-section">
      {title ? (
        <div className="files-header">
          <h2>{title}</h2>
          <span className="muted">{resolvedFiles.length} files</span>
        </div>
      ) : null}
      {resolvedFiles.length ? (
        <div className="my-files-list">
          {resolvedFiles.map((file) => (
            <button
              key={file.id || file.file_name || file.filename}
              type="button"
              className={`my-file-row ${(selectedFile?.file_name || selectedFile?.filename) === (file.file_name || file.filename) ? 'highlight' : ''}`}
              onClick={() => onFileSelect(file)}
            >
              <div>
                <p>{file.file_name || file.filename}</p>
                <small>
                  {formatDate(file.uploaded_at)} • {formatBytes(file.size ?? file.size_bytes)}
                </small>
              </div>
              <StatusPill status={file.status} />
            </button>
          ))}
        </div>
      ) : (
        <p className="empty-state">{emptyMessage}</p>
      )}
    </section>
  );
}
