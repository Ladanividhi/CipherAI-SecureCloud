import React from 'react';
import StatusPill from './StatusPill';
import { formatBytes, formatDate } from '../utils/formatters';

export default function FileList({ files, onFileSelect, selectedFile }) {
  return (
    <section className="files-section">
      <div className="files-header">
        <h2>My Files</h2>
        <span className="muted">{files.length} files</span>
      </div>
      {files.length ? (
        <div className="my-files-list">
          {files.map((file) => (
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
        <p className="empty-state">No files yet. Upload something to get started.</p>
      )}
    </section>
  );
}
