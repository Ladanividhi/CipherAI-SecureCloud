import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import FileList from '../components/FileList';

export default function MyFiles() {
  const navigate = useNavigate();
  const { filesState, uploaderState } = useOutletContext();

  const [folders, setFolders] = useState({ totalCount: 0, untaggedCount: 0, tags: [] });
  const [untaggedFiles, setUntaggedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const [folderSummary, untagged] = await Promise.all([
          filesState.fetchTagFolders(),
          filesState.fetchUntaggedFiles(),
        ]);
        if (!alive) return;
        setFolders(folderSummary);
        setUntaggedFiles(untagged);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [filesState]);

  const tagFolders = useMemo(() => (Array.isArray(folders.tags) ? folders.tags : []), [folders.tags]);
  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const visibleTagFolders = useMemo(() => {
    if (!normalizedSearch) return tagFolders;
    return tagFolders.filter((tag) => {
      const name = String(tag.tag_name || '').toLowerCase();
      const id = String(tag.tag_id || '').toLowerCase();
      return name.includes(normalizedSearch) || id.includes(normalizedSearch);
    });
  }, [normalizedSearch, tagFolders]);

  const visibleUntaggedFiles = useMemo(() => {
    if (!normalizedSearch) return untaggedFiles;
    return (Array.isArray(untaggedFiles) ? untaggedFiles : []).filter((file) => {
      const filename = String(file.file_name || file.filename || '').toLowerCase();
      return filename.includes(normalizedSearch);
    });
  }, [normalizedSearch, untaggedFiles]);

  return (
    <main className="main-content">
      <header className="main-header">
        <div>
          <h1>My Files</h1>
          <p>Browse your encrypted files by tag.</p>
        </div>
        <div className="header-actions">
          <input
            type="search"
            placeholder="Search tags or files..."
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
          <h2>Folders</h2>
          <span className="muted">{folders.totalCount} files</span>
        </div>

        {loading ? (
          <p className="muted">Loading folders…</p>
        ) : (
          <div className="folder-grid">
            {visibleTagFolders.map((tag) => {
              const tagName = tag.tag_name || tag.tag_id;
              return (
                <button
                  key={tag.tag_id}
                  type="button"
                  className="folder-card folder-card--button"
                  onClick={() => navigate(`/my-files/${encodeURIComponent(tag.tag_id)}`)}
                >
                  <div className="folder-icon" style={{ backgroundColor: '#8e9dff' }} />
                  <p>{tagName}</p>
                  <span>{tag.count} files</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <FileList
        title="Untagged Files"
        files={visibleUntaggedFiles}
        onFileSelect={filesState.handleFileSelect}
        selectedFile={filesState.selectedFile}
        emptyMessage={normalizedSearch ? 'No matching untagged files.' : 'No untagged files.'}
      />
    </main>
  );
}
