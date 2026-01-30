import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
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

  const isUntagged = normalizeTagId(decodedTagKey) === 'untagged';
  const tagId = useMemo(() => (isUntagged ? '' : normalizeTagId(decodedTagKey)), [decodedTagKey, isUntagged]);

  useEffect(() => {
    let alive = true;
    const resolveName = async () => {
      if (isUntagged) {
        setResolvedTagName('Untagged Files');
        return;
      }
      const summary = await filesState.fetchTagFolders();
      if (!alive) return;
      const match = (Array.isArray(summary.tags) ? summary.tags : []).find(
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

  return (
    <main className="main-content">
      <header className="main-header">
        <div>
          <h1>
            <Link className="breadcrumb" to="/my-files">My Files</Link>
            <span className="breadcrumb-sep">›</span>
            <span>{resolvedTagName || (isUntagged ? 'Untagged Files' : decodedTagKey)}</span>
          </h1>
          <p>{isUntagged ? 'Files without any tag.' : `Files tagged under “${resolvedTagName || decodedTagKey}”.`}</p>
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

      <div className="files-header">
        <button className="ghost-btn" type="button" onClick={() => navigate('/my-files')}>Back</button>
      </div>

      {loading ? (
        <p className="muted">Loading files…</p>
      ) : (
        <FileList
          title={resolvedTagName || (isUntagged ? 'Untagged Files' : decodedTagKey)}
          files={visibleFiles}
          onFileSelect={filesState.handleFileSelect}
          selectedFile={filesState.selectedFile}
          emptyMessage={normalizedSearch ? 'No matching files.' : 'No files in this folder yet.'}
        />
      )}
    </main>
  );
}
