import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import FileList from '../components/FileList';

export default function Dashboard() {
  const navigate = useNavigate();
  const { filesState, uploaderState } = useOutletContext();

  const [fileCount, setFileCount] = useState(0);
  const [recentFiles, setRecentFiles] = useState([]);
  const [loadingCount, setLoadingCount] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoadingCount(true);
      setLoadingRecent(true);
      try {
        const [count, recent] = await Promise.all([
          filesState.fetchFileCount(),
          filesState.fetchRecentFiles(10),
        ]);
        if (!alive) return;
        setFileCount(count);
        setRecentFiles(recent);
      } finally {
        if (alive) {
          setLoadingCount(false);
          setLoadingRecent(false);
        }
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [filesState]);

  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const visibleRecentFiles = useMemo(() => {
    if (!normalizedSearch) return recentFiles;
    return (Array.isArray(recentFiles) ? recentFiles : []).filter((file) => {
      const filename = String(file.file_name || file.filename || '').toLowerCase();
      return filename.includes(normalizedSearch);
    });
  }, [normalizedSearch, recentFiles]);

  // Dashboard only shows recent files; no need to compute full list filters.

  return (
    <main className="main-content">
      <header className="main-header">
        <div>
          <h1>Dashboard</h1>
          <p>Manage your encrypted files securely.</p>
        </div>
        <div className="header-actions">
          <input
            type="search"
            placeholder="Search your files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="primary-btn"
            onClick={uploaderState.handleUploadClick}
            disabled={filesState.busy}
            type="button"
          >
            {filesState.busy ? 'Working...' : 'Upload New File'}
          </button>
        </div>
      </header>

      {filesState.status && <div className="status-banner">{filesState.status}</div>}

      <section className="folders-section">
        <div className="files-header">
          <h2>My Files</h2>
          <span className="muted">Quick access</span>
        </div>
        <div className="folder-grid">
          <button
            type="button"
            className="folder-card folder-card--button"
            onClick={() => navigate('/my-files')}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '20px',
              padding: '24px',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              background: 'linear-gradient(145deg, rgba(31, 41, 55, 0.6), rgba(17, 24, 39, 0.8))'
            }}
          >
            <div className="folder-icon" style={{
              width: '56px',
              height: '56px',
              backgroundColor: 'rgba(99, 102, 241, 0.2)',
              display: 'grid',
              placeItems: 'center',
              borderRadius: '16px'
            }}>
              <FolderOpen size={28} color="#6366f1" />
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: '1.2rem', margin: '0 0 4px 0' }}>All Files</p>
              <span style={{ fontSize: '1rem', opacity: 0.8 }}>{loadingCount ? '…' : fileCount} stored files</span>
            </div>
          </button>
        </div>
      </section>

      <section className="files-section">
        <div className="files-header">
          <h2>Recent Files</h2>
          <span className="muted">Last opened</span>
        </div>
        {loadingRecent ? (
          <p className="muted">Loading recent files…</p>
        ) : (
          <FileList
            title={null}
            files={visibleRecentFiles}
            onFileSelect={filesState.handleFileSelect}
            selectedFile={filesState.selectedFile}
            emptyMessage={
              normalizedSearch ? 'No matching recent files.' : 'No recently opened files yet.'
            }
          />
        )}
      </section>
    </main>
  );
}
