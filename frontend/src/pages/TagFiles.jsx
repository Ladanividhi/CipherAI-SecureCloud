import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2, Share2, FolderInput, X, CheckSquare } from 'lucide-react';
import FileList from '../components/FileList';

const normalizeTagId = (value) => String(value || '').trim().toLowerCase();

export default function TagFiles() {
  const navigate = useNavigate();
  const { tagName } = useParams();
  const decodedTagKey = useMemo(() => decodeURIComponent(tagName || ''), [tagName]);

  const { filesState, uploaderState } = useOutletContext();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [resolvedTagName, setResolvedTagName] = useState('');
  const [availableTags, setAvailableTags] = useState([]); // Store tags for dropdown

  // Selection State
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [targetFolder, setTargetFolder] = useState(''); // Tag ID input

  const isUntagged = normalizeTagId(decodedTagKey) === 'untagged';
  const tagId = useMemo(() => (isUntagged ? '' : normalizeTagId(decodedTagKey)), [decodedTagKey, isUntagged]);

  useEffect(() => {
    let alive = true;
    const resolveName = async () => {
      // Fetch all tags from the tags table for the dropdown
      const tagsList = await filesState.fetchAllTags();
      if (!alive) return;

      setAvailableTags(Array.isArray(tagsList) ? tagsList : []);

      if (isUntagged) {
        setResolvedTagName('Untagged Files');
        return;
      }
      const match = (Array.isArray(tagsList) ? tagsList : []).find(
        (t) => String(t.tag_id || '').toLowerCase() === tagId,
      );
      setResolvedTagName(match?.tag_name || match?.tag_id || decodedTagKey);
    };
    resolveName();
    return () => {
      alive = false;
    };
  }, [decodedTagKey, filesState, isUntagged, tagId]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const nextFiles = isUntagged
          ? await filesState.fetchUntaggedFiles()
          : await filesState.fetchFilesByTagId(tagId);
        if (!alive) return;
        setFiles(nextFiles);
        setSelectedIds(new Set()); // Clear selection on load
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [filesState, isUntagged, tagId]);

  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);
  const visibleFiles = useMemo(() => {
    if (!normalizedSearch) return files;
    return (Array.isArray(files) ? files : []).filter((file) => {
      const filename = String(file.file_name || file.filename || '').toLowerCase();
      return filename.includes(normalizedSearch);
    });
  }, [files, normalizedSearch]);

  // Selection Handlers
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
      const allIds = visibleFiles.map(f => f.file_name || f.filename);
      setSelectedIds(new Set(allIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  const getSelectedFilesObjects = () => {
    return files.filter(f => selectedIds.has(f.file_name || f.filename));
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
    // Refresh logic is in hook, but we need to locally refresh too
    // Actually fetchFilesByTagId is called by hook? No, hook refreshes global list. 
    // We should probably re-trigger the load effect or wait for global refresh.
    // For now, let's just reload this view.
    const nextFiles = isUntagged
      ? await filesState.fetchUntaggedFiles()
      : await filesState.fetchFilesByTagId(tagId);
    setFiles(nextFiles);
    setSelectedIds(new Set());
  };

  const handleBulkMove = async () => {
    if (!targetFolder.trim()) return;
    const items = getSelectedFilesObjects();
    await filesState.moveFiles(items, targetFolder);
    setShowMoveModal(false);

    const nextFiles = isUntagged
      ? await filesState.fetchUntaggedFiles()
      : await filesState.fetchFilesByTagId(tagId);
    setFiles(nextFiles);
    setSelectedIds(new Set());
  };

  return (
    <main className="main-content" style={{ position: 'relative' }}>
      <header className="main-header" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            type="button"
            onClick={() => navigate('/my-files')}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.5rem', margin: 0 }}>
              <span style={{ opacity: 0.5, fontWeight: 400 }}>My Files</span>
              <span style={{ opacity: 0.5 }}>/</span>
              <span>{resolvedTagName || (isUntagged ? 'Untagged Files' : decodedTagKey)}</span>
            </h1>
          </div>
        </div>
        <div className="header-actions">
          <input
            type="search"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="primary-btn" onClick={uploaderState.handleUploadClick} disabled={filesState.busy} type="button">
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
              <option value="untagged">Untagged (Remove from folder)</option>
              {availableTags.map(tag => (
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

      {loading ? (
        <p className="muted" > Loading files…</p>
      ) : (
        <FileList
          title={resolvedTagName || (isUntagged ? 'Untagged Files' : decodedTagKey)}
          files={visibleFiles}
          onFileSelect={filesState.handleFileSelect}
          selectedFile={filesState.selectedFile}
          emptyMessage={normalizedSearch ? 'No matching files.' : 'No files in this folder yet.'}
          selection={selectedIds}
          onToggleSelection={toggleSelection}
          onSelectAll={selectAll}
        />
      )}
    </main>
  );
}

