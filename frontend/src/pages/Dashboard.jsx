import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { FolderOpen, Search, FileText, Folder, X } from 'lucide-react';
import FileList from '../components/FileList';

export default function Dashboard() {
  const navigate = useNavigate();
  const { filesState, uploaderState } = useOutletContext();

  const [fileCount, setFileCount] = useState(0);
  const [recentFiles, setRecentFiles] = useState([]);
  const [loadingCount, setLoadingCount] = useState(false);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

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

  // Debounced global search
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    setSearch(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    setShowSearchResults(true);
    debounceRef.current = setTimeout(async () => {
      const results = await filesState.searchFiles(value);
      setSearchResults(results);
      setSearchLoading(false);
    }, 300);
  }, [filesState]);

  // Close search results on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const clearSearch = () => {
    setSearch('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  return (
    <main className="main-content">
      <header className="main-header">
        <div>
          <h1>Dashboard</h1>
          <p>Manage your encrypted files securely.</p>
        </div>
        <div className="header-actions">
          <div ref={searchRef} style={{ position: 'relative' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', color: '#6b7280', pointerEvents: 'none' }} />
              <input
                type="search"
                placeholder="Search all files..."
                value={search}
                onChange={handleSearchChange}
                onFocus={() => { if (search.trim()) setShowSearchResults(true); }}
                style={{ paddingLeft: '36px', paddingRight: search ? '32px' : '12px' }}
              />
              {search && (
                <button
                  onClick={clearSearch}
                  style={{
                    position: 'absolute', right: '8px', background: 'none', border: 'none',
                    color: '#6b7280', cursor: 'pointer', padding: '4px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Search Results Dropdown */}
            {showSearchResults && search.trim() && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                marginTop: '8px', background: '#1f2937',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px', maxHeight: '400px', overflowY: 'auto',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)', zIndex: 1000,
                minWidth: '380px'
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {searchLoading ? 'Searching...' : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
                  </span>
                </div>

                {searchLoading ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                    <div style={{ display: 'inline-block', width: '20px', height: '20px', border: '2px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                    No files matching "<span style={{ color: '#fff' }}>{search}</span>"
                  </div>
                ) : (
                  searchResults.map((file, idx) => {
                    const fileName = file.file_name || file.filename || '';
                    const folderPath = file.folder_path || 'Untagged';
                    const fullPath = folderPath === 'Untagged' ? fileName : `${folderPath} / ${fileName}`;
                    return (
                      <button
                        key={file.id || idx}
                        onClick={() => {
                          filesState.handleFileSelect(file);
                          setShowSearchResults(false);
                        }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '12px 16px', background: 'transparent', border: 'none',
                          borderBottom: idx < searchResults.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          color: '#fff', cursor: 'pointer', textAlign: 'left',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '10px',
                          background: 'rgba(99,102,241,0.15)', display: 'grid',
                          placeItems: 'center', flexShrink: 0
                        }}>
                          <FileText size={18} color="#818cf8" />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {fileName}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
                            <Folder size={12} color="#6b7280" />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullPath}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

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
            files={recentFiles}
            onFileSelect={filesState.handleFileSelect}
            selectedFile={filesState.selectedFile}
            emptyMessage="No recently opened files yet."
          />
        )}
      </section>
    </main>
  );
}
