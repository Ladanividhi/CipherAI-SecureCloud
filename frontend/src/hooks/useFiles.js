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

  const handleShare = useCallback(async () => {
    if (!selectedFile) {
      return;
    }
    const message = `SecureCloud file ready: ${selectedFile.file_name || selectedFile.filename}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'SecureCloud File', text: message });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        setStatus('Share text copied to clipboard.');
        return;
      }
      setStatus('Sharing is not supported on this device.');
    } catch (error) {
      setStatus(error.message || 'Unable to share file.');
    }
  }, [selectedFile]);

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
    preparePreview,
    handleFileSelect,
    handleClosePreview,
    handleDownload,
    handleShare,
    authorizedFetch,
  };
}
