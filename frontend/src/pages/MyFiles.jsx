import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

import { Folder, Trash2, Share2, FolderInput, X, CheckSquare } from 'lucide-react';
import FileList from '../components/FileList';

export default function MyFiles() {
  const navigate = useNavigate();
  const { filesState, uploaderState } = useOutletContext();

  const [folders, setFolders] = useState({ totalCount: 0, untaggedCount: 0, tags: [] });
  const [untaggedFiles, setUntaggedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Selection State
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [targetFolder, setTargetFolder] = useState('');

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
        setSelectedIds(new Set());
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

  // Bulk Actions
  const toggleSelection = (fileName) => {
    const next = new Set(selectedIds);
    if (next.has(fileName)) {
      next.delete(fileName);
    } else {
      next.add(fileName);
    }
    setSelectedIds(next);
  };

  const selectAll = (shouldSelect) => {
    if (shouldSelect) {
      const allIds = visibleUntaggedFiles.map(f => f.file_name || f.filename);
      setSelectedIds(new Set(allIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  const getSelectedFilesObjects = () => {
    return untaggedFiles.filter(f => selectedIds.has(f.file_name || f.filename));
  };

  const handleBulkShare = async () => {
    const items = getSelectedFilesObjects();
    await filesState.handleShare(items);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} files?`)) return;
    const items = getSelectedFilesObjects();
    await filesState.deleteFiles(items);

    const refreshedUntagged = await filesState.fetchUntaggedFiles();
    setUntaggedFiles(refreshedUntagged);
    setSelectedIds(new Set());
  };

  const handleBulkMove = async () => {
    if (!targetFolder.trim()) return;
    const items = getSelectedFilesObjects();
    await filesState.moveFiles(items, targetFolder);
    setShowMoveModal(false);

    const [refreshedFolders, refreshedUntagged] = await Promise.all([
      filesState.fetchTagFolders(),
      filesState.fetchUntaggedFiles(),
    ]);
    setFolders(refreshedFolders);
    setUntaggedFiles(refreshedUntagged);
    setSelectedIds(new Set());
  };

  return (
    <main className="main-content" style={{ position: 'relative' }}>
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

      {/* Bulk Actions Toolbar */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'sticky',
          top: '10px',
          zIndex: 100,
          background: 'rgba(99, 102, 241, 0.15)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '16px',
          padding: '12px 24px',
          marginBottom: '16px',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#fff', fontWeight: 600 }}>
            <CheckSquare size={20} color="#818cf8" />
            <span>{selectedIds.size} selected</span>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setShowMoveModal(true)} style={{ display: 'flex', gap: '8px', padding: '8px 16px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', alignItems: 'center' }}>
              <FolderInput size={18} /> Move
            </button>
            <button onClick={handleBulkShare} style={{ display: 'flex', gap: '8px', padding: '8px 16px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', alignItems: 'center' }}>
              <Share2 size={18} /> Share
            </button>
            <button onClick={handleBulkDelete} style={{ display: 'flex', gap: '8px', padding: '8px 16px', borderRadius: '10px', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', alignItems: 'center' }}>
              <Trash2 size={18} /> Delete
            </button>
            <button onClick={() => selectAll(false)} style={{ padding: '8px', borderRadius: '10px', border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {showMoveModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#1f2937', padding: '24px', borderRadius: '20px', width: '400px',
            border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
          }}>
            <h3 style={{ marginTop: 0 }}>Move {selectedIds.size} Items</h3>
            <p style={{ color: '#9ca3af', marginBottom: '16px' }}>Select the folder to move these files to.</p>

            <select
              value={targetFolder}
              onChange={e => setTargetFolder(e.target.value)}
              style={{
                width: '100%', padding: '12px', borderRadius: '12px',
                background: '#111827', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', marginBottom: '20px', appearance: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="" disabled>Select a folder...</option>
              {/* Allow leaving untagged as an option (though they are already untagged here, but user might want to re-confirm or if we reuse this logic) */}
              {tagFolders.map(tag => (
                <option key={tag.tag_id} value={tag.tag_id}>
                  {tag.tag_name || tag.tag_id}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setShowMoveModal(false)} style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleBulkMove} disabled={!targetFolder} style={{ padding: '10px 16px', borderRadius: '10px', border: 'none', background: targetFolder ? '#6366f1' : '#4b5563', color: '#fff', cursor: targetFolder ? 'pointer' : 'not-allowed' }}>Confirm Move</button>
            </div>
          </div>
        </div>
      )}

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
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '16px 12px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.05)',
                    boxShadow: 'none',
                    gap: '8px'
                  }}
                >
                  <div className="folder-icon" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 'auto',
                    height: 'auto',
                    background: 'transparent',
                    borderRadius: 0,
                    marginBottom: 0
                  }}>
                    <Folder size={48} color="#FBC02D" fill="#FBC02D" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <p style={{
                      fontSize: '0.9rem',
                      fontWeight: 500,
                      margin: 0,
                      color: 'var(--text)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%'
                    }}
                      title={tagName}
                    >
                      {tagName}
                    </p>
                    <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{tag.count} files</span>
                  </div>
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
        selection={selectedIds}
        onToggleSelection={toggleSelection}
        onSelectAll={selectAll}
      />
    </main>
  );
}

