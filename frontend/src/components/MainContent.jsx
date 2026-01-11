import React from 'react';
import { folders } from '../utils/constants';
import FolderCard from './FolderCard';
import FileList from './FileList';

export default function MainContent({ files, onUploadClick, onFileSelect, selectedFile, busy, status }) {
  return (
    <main className="main-content">
      <header className="main-header">
        <div>
          <h1>Projects › Marketing › Q3</h1>
          <p>Files stored locally and ready for encryption.</p>
        </div>
        <div className="header-actions">
          <input type="search" placeholder="Search files, folders, or ask AI..." />
          <button className="primary-btn" onClick={onUploadClick} disabled={busy} type="button">
            {busy ? 'Working...' : 'Upload New File'}
          </button>
        </div>
      </header>

      {status && <div className="status-banner">{status}</div>}

      <section className="folders-section">
        <h2>Folders</h2>
        <div className="folder-grid">
          {folders.map((folder) => (
            <FolderCard key={folder.id} folder={folder} />
          ))}
        </div>
      </section>

      <FileList files={files} onFileSelect={onFileSelect} selectedFile={selectedFile} />
    </main>
  );
}
