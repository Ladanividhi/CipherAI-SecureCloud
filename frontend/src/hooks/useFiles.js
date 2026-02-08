import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeAuthorizedFetch } from '../utils/api';
import { formatBytes, formatDate } from '../utils/formatters';

export default function useFiles(idToken) {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  const authorizedFetch = useCallback(makeAuthorizedFetch(idToken), [idToken]);

  const previewObjectUrl = useRef('');
  const decryptedNameRef = useRef('');

  const releasePreview = useCallback(() => {
    if (previewObjectUrl.current) {
      URL.revokeObjectURL(previewObjectUrl.current);
      previewObjectUrl.current = '';
    }
  }, []);

  useEffect(() => () => releasePreview(), [releasePreview]);

  const storageUsage = useMemo(() => {
    const quotaGb = 100;
    const usedBytes = files.reduce((total, file) => total + (file.size ?? file.size_bytes ?? 0), 0);
    const usedGb = usedBytes / 1024 ** 3;
    const percent = quotaGb ? Math.min((usedGb / quotaGb) * 100, 100) : 0;
    return {
      label: `${usedGb.toFixed(2)} GB of ${quotaGb} GB`,
      percent,
      usedGb,
      quotaGb,
      usedBytes,
    };
  }, [files]);

  const fetchFiles = useCallback(async () => {
    if (!idToken) {
      setFiles([]);
      return null;
    }
    try {
      const response = await authorizedFetch('/files');
      if (!response.ok) {
        throw new Error('Unable to load files.');
      }
      const data = await response.json();
      const list = Array.isArray(data.files) ? data.files : [];
      setFiles(list);
      return { files: list };
    } catch (error) {
      setStatus(error.message);
      return null;
    }
  }, [authorizedFetch, idToken]);

  const fetchFileCount = useCallback(async () => {
    if (!idToken) {
      return 0;
    }
    try {
      const res = await authorizedFetch('/files/count');
      if (!res.ok) {
        throw new Error('Unable to load file count.');
      }
      const data = await res.json();
      const count = typeof data.count === 'number' ? data.count : Number(data.count);
      return Number.isFinite(count) ? count : 0;
    } catch (error) {
      setStatus(error.message || 'Unable to load file count.');
      return 0;
    }
  }, [authorizedFetch, idToken]);

  const fetchRecentFiles = useCallback(
    async (limit = 10) => {
      if (!idToken) {
        return [];
      }
      const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
      try {
        const res = await authorizedFetch(`/files/recent?limit=${safeLimit}`);
        if (!res.ok) {
          throw new Error('Unable to load recent files.');
        }
        const data = await res.json();
        return Array.isArray(data.files) ? data.files : [];
      } catch (error) {
        setStatus(error.message || 'Unable to load recent files.');
        return [];
      }
    },
    [authorizedFetch, idToken],
  );

  const fetchTagFolders = useCallback(async () => {
    if (!idToken) {
      return { totalCount: 0, untaggedCount: 0, tags: [] };
    }
    try {
      const res = await authorizedFetch('/files/tag-folders');
      if (!res.ok) {
        throw new Error('Unable to load folders.');
      }
      const data = await res.json();
      return {
        totalCount: typeof data.total_count === 'number' ? data.total_count : 0,
        untaggedCount: typeof data.untagged_count === 'number' ? data.untagged_count : 0,
        tags: Array.isArray(data.tags) ? data.tags : [],
      };
    } catch (error) {
      setStatus(error.message || 'Unable to load folders.');
      return { totalCount: 0, untaggedCount: 0, tags: [] };
    }
  }, [authorizedFetch, idToken]);

  const fetchFilesByTagId = useCallback(
    async (tagId) => {
      if (!idToken) {
        return [];
      }
      const safeTagId = String(tagId || '').trim().toLowerCase();
      if (!safeTagId) {
        return [];
      }
      try {
        const res = await authorizedFetch(`/files/by-tag/${encodeURIComponent(safeTagId)}`);
        if (!res.ok) {
          throw new Error('Unable to load files for tag.');
        }
        const data = await res.json();
        return Array.isArray(data.files) ? data.files : [];
      } catch (error) {
        setStatus(error.message || 'Unable to load files for tag.');
        return [];
      }
    },
    [authorizedFetch, idToken],
  );

  const fetchUntaggedFiles = useCallback(async () => {
    if (!idToken) {
      return [];
    }
    try {
      const res = await authorizedFetch('/files/untagged');
      if (!res.ok) {
        throw new Error('Unable to load untagged files.');
      }
      const data = await res.json();
      return Array.isArray(data.files) ? data.files : [];
    } catch (error) {
      setStatus(error.message || 'Unable to load untagged files.');
      return [];
    }
  }, [authorizedFetch, idToken]);

  const fetchAllTags = useCallback(async () => {
    if (!idToken) {
      return [];
    }
    try {
      const res = await authorizedFetch('/tags');
      if (!res.ok) {
        throw new Error('Unable to load tags.');
      }
      const data = await res.json();
      return Array.isArray(data.tags) ? data.tags : [];
    } catch (error) {
      setStatus(error.message || 'Unable to load tags.');
      return [];
    }
  }, [authorizedFetch, idToken]);

  const searchFiles = useCallback(async (query) => {
    if (!idToken || !query || !query.trim()) {
      return [];
    }
    try {
      const res = await authorizedFetch(`/files/search?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) {
        throw new Error('Search failed.');
      }
      const data = await res.json();
      return Array.isArray(data.results) ? data.results : [];
    } catch (error) {
      setStatus(error.message || 'Search failed.');
      return [];
    }
  }, [authorizedFetch, idToken]);

  useEffect(() => {
    if (idToken) {
      fetchFiles();
    }
  }, [fetchFiles, idToken]);

  const preparePreview = useCallback(
    async (file) => {
      if (!file) {
        return null;
      }
      const displayName = file.file_name || file.filename;
      setBusy(true);
      setStatus('Decrypting file...');
      try {
        const res = await authorizedFetch('/decrypt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_name: displayName }),
        });
        if (!res.ok) {
          throw new Error('Decryption failed.');
        }
        const result = await res.json();
        decryptedNameRef.current = result.decrypted_filename;

        const downloadRes = await authorizedFetch(`/download/decrypted/${result.decrypted_filename}`);
        if (!downloadRes.ok) {
          throw new Error('Unable to load preview.');
        }
        const blob = await downloadRes.blob();
        releasePreview();
        const url = URL.createObjectURL(blob);
        previewObjectUrl.current = url;
        setPreviewUrl(url);
        setStatus(`Opened ${displayName}.`);

        const refreshed = await fetchFiles();
        if (refreshed?.files) {
          const updatedEntry = refreshed.files.find(
            (item) => (item.file_name || item.filename) === displayName,
          );
          if (updatedEntry) {
            setSelectedFile(updatedEntry);
          }
        }

        return result.decrypted_filename;
      } catch (error) {
        setStatus(error.message || 'Unable to open file.');
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [authorizedFetch, fetchFiles, releasePreview],
  );

  const handleFileSelect = useCallback(
    async (file) => {
      if (!file) {
        setSelectedFile(null);
        setShowPreview(false);
        return;
      }
      setSelectedFile(file);
      setShowPreview(true);
      decryptedNameRef.current = '';
      setPreviewUrl('');
      try {
        await preparePreview(file);
      } catch (error) {
        console.error(error);
      }
    },
    [preparePreview],
  );

  const handleClosePreview = useCallback(() => {
    setShowPreview(false);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!selectedFile) {
      return;
    }
    try {
      const displayName = selectedFile.file_name || selectedFile.filename;
      if (!previewObjectUrl.current) {
        await preparePreview(selectedFile);
      }
      if (!previewObjectUrl.current) {
        throw new Error('Preview not ready.');
      }
      const anchor = document.createElement('a');
      anchor.href = previewObjectUrl.current;
      anchor.download = displayName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setStatus(`Downloading ${displayName}...`);
    } catch (error) {
      setStatus(error.message || 'Unable to download file.');
    }
  }, [preparePreview, selectedFile]);

  const handleShare = useCallback(async (filesToShare = null) => {
    // If we passed an array, use it; otherwise fallback to selectedFile
    const targetFiles = Array.isArray(filesToShare) ? filesToShare : (selectedFile ? [selectedFile] : []);

    if (targetFiles.length === 0) return;

    const fileNames = targetFiles.map(f => f.file_name || f.filename);

    try {
      const res = await authorizedFetch('/files/bulk/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_names: fileNames }),
      });

      if (!res.ok) throw new Error("Share failed");
      const data = await res.json();

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(data.share_link);
        setStatus('Sharable link copied to clipboard!');
      } else {
        setStatus('Files shared successfully.');
      }
    } catch (error) {
      setStatus(error.message || 'Unable to share file.');
    }
  }, [selectedFile, authorizedFetch]);

  const deleteFiles = useCallback(async (filesToDelete) => {
    if (!filesToDelete || filesToDelete.length === 0) return;
    const fileNames = filesToDelete.map(f => f.file_name || f.filename);
    setBusy(true);
    try {
      const res = await authorizedFetch('/files/bulk/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_names: fileNames })
      });
      if (!res.ok) throw new Error("Delete failed");
      await fetchFiles(); // Refresh list
      setStatus(`Deleted ${fileNames.length} files.`);
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  }, [authorizedFetch, fetchFiles]);

  const moveFiles = useCallback(async (filesToMove, targetTagId) => {
    if (!filesToMove || filesToMove.length === 0) return;
    const fileNames = filesToMove.map(f => f.file_name || f.filename);
    setBusy(true);
    try {
      const res = await authorizedFetch('/files/bulk/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_names: fileNames, target_tag_id: targetTagId })
      });
      if (!res.ok) throw new Error("Move failed");
      await fetchFiles();
      await fetchTagFolders(); // Refresh folders too
      setStatus(`Moved ${fileNames.length} files.`);
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  }, [authorizedFetch, fetchFiles, fetchTagFolders]);

  return {
    files,
    setFiles,
    selectedFile,
    setSelectedFile,
    status,
    setStatus,
    busy,
    setBusy,
    showPreview,
    setShowPreview,
    previewUrl,
    storageUsage,
    formatBytes,
    formatDate,
    fetchFiles,
    fetchFileCount,
    fetchRecentFiles,
    fetchTagFolders,
    fetchAllTags,
    fetchFilesByTagId,
    fetchUntaggedFiles,
    searchFiles,
    preparePreview,
    handleFileSelect,
    handleClosePreview,
    handleDownload,
    handleShare,
    deleteFiles,
    moveFiles,
    authorizedFetch,
  };
}
