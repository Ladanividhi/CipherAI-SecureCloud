import { useCallback, useRef, useState } from 'react';
import { makeAuthorizedFetch } from '../utils/api';
import { MAX_UPLOAD_FILES } from '../utils/constants';

export default function useUploader({ idToken, fetchFiles, setSelectedFile, setStatus, busy, setBusy }) {
  const [showUploader, setShowUploader] = useState(false);
  const [uploadTags, setUploadTags] = useState([]);
  const [pendingUploads, setPendingUploads] = useState([]);
  const [applyToAll, setApplyToAll] = useState(true);
  const [globalTagId, setGlobalTagId] = useState('');
  const [globalExpiry, setGlobalExpiry] = useState('');
  const [globalAdvanceSecurity, setGlobalAdvanceSecurity] = useState(true);
  const [showSecurityWarning, setShowSecurityWarning] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  const fileInputRef = useRef(null);
  const authorizedFetch = useCallback(makeAuthorizedFetch(idToken), [idToken]);

  const fetchTags = useCallback(async () => {
    if (!idToken) {
      setUploadTags([]);
      return [];
    }
    try {
      const response = await authorizedFetch('/tags');
      if (!response.ok) {
        throw new Error('Unable to load tags.');
      }
      const data = await response.json();
      const list = Array.isArray(data.tags) ? data.tags : [];
      setUploadTags(list);
      return list;
    } catch (error) {
      setUploadMessage(error.message || 'Unable to load tags.');
      setUploadTags([]);
      return [];
    }
  }, [authorizedFetch, idToken]);

  const handleUploadClick = () => {
    setUploadMessage('');
    setShowUploader(true);
    fetchTags();
  };

  const handleCloseUploader = () => {
    setShowUploader(false);
    setPendingUploads([]);
    setGlobalTagId('');
    setGlobalExpiry('');
    setApplyToAll(true);
    setGlobalAdvanceSecurity(true);
    setShowSecurityWarning(false);
    setUploadMessage('');
  };

  const triggerSecurityWarning = () => {
    setShowSecurityWarning(true);
  };

  const handleCloseSecurityWarning = () => {
    setShowSecurityWarning(false);
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const uploadIdForFile = (file) => `${file.name}:${file.size}:${file.lastModified}`;

  const applyGlobalsToPending = useCallback(
    (
      patch,
      { force = false } = {
        force: false,
      },
    ) => {
      setPendingUploads((prev) =>
        prev.map((item) => {
          if (!applyToAll && !force) return item;
          const next = { ...item };
          if (Object.prototype.hasOwnProperty.call(patch, 'tagId')) {
            next.tagId = patch.tagId;
            next.tagOverridden = false;
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'expiry')) {
            next.expiry = patch.expiry;
            next.expiryOverridden = false;
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'advance_security')) {
            next.advance_security = patch.advance_security;
            next.securityOverridden = false;
          }
          return next;
        }),
      );
    },
    [applyToAll],
  );

  const handleGlobalTagChange = (value) => {
    setGlobalTagId(value);
    applyGlobalsToPending({ tagId: value });
  };

  const handleGlobalExpiryChange = (value) => {
    setGlobalExpiry(value);
    applyGlobalsToPending({ expiry: value });
  };

  const handleApplyToAllChange = (checked) => {
    setApplyToAll(checked);
    if (checked) {
      applyGlobalsToPending(
        { tagId: globalTagId, expiry: globalExpiry, advance_security: globalAdvanceSecurity },
        { force: true },
      );
    }
  };

  const handleGlobalAdvanceSecurityChange = (checked) => {
    setGlobalAdvanceSecurity(checked);
    if (!checked) {
      triggerSecurityWarning();
    }
    applyGlobalsToPending({ advance_security: checked });
  };

  const handleFileTagChange = (id, tagId) => {
    if (applyToAll) {
      setApplyToAll(false);
    }
    setPendingUploads((prev) =>
      prev.map((item) => (item.id === id ? { ...item, tagId, tagOverridden: true } : item)),
    );
  };

  const handleFileExpiryChange = (id, expiry) => {
    if (applyToAll) {
      setApplyToAll(false);
    }
    setPendingUploads((prev) =>
      prev.map((item) => (item.id === id ? { ...item, expiry, expiryOverridden: true } : item)),
    );
  };

  const handleFileAdvanceSecurityChange = (id, checked) => {
    if (applyToAll) {
      setApplyToAll(false);
    }
    setPendingUploads((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, advance_security: checked, securityOverridden: true } : item,
      ),
    );
    if (!checked) {
      triggerSecurityWarning();
    }
  };

  const handleRemovePendingUpload = (id) => {
    setPendingUploads((prev) => prev.filter((item) => item.id !== id));
  };

  const handleFileChange = async (event) => {
    const picked = Array.from(event.target.files || []);
    try {
      if (!picked.length) return;
      setUploadMessage('');
      setShowUploader(true);
      fetchTags();

      setPendingUploads((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const remaining = Math.max(MAX_UPLOAD_FILES - prev.length, 0);
        if (remaining === 0) {
          setUploadMessage(`You can upload up to ${MAX_UPLOAD_FILES} files at a time.`);
          return prev;
        }

        const slice = picked.slice(0, remaining);
        if (slice.length < picked.length) {
          setUploadMessage(`File limit reached: only ${MAX_UPLOAD_FILES} files allowed per upload.`);
        }

        const additions = slice
          .filter((file) => !existingIds.has(uploadIdForFile(file)))
          .map((file) => ({
            id: uploadIdForFile(file),
            file,
            tagId: applyToAll ? globalTagId : '',
            expiry: applyToAll ? globalExpiry : '',
            advance_security: applyToAll ? globalAdvanceSecurity : true,
            tagOverridden: false,
            expiryOverridden: false,
            securityOverridden: false,
          }));

        return [...prev, ...additions];
      });
    } finally {
      event.target.value = '';
    }
  };

  const toIsoStringFromDatetimeLocal = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
  };

  const handleUploadSelected = useCallback(async () => {
    if (!pendingUploads.length) {
      setUploadMessage('Select at least one file to upload.');
      return;
    }
    if (pendingUploads.length > MAX_UPLOAD_FILES) {
      setUploadMessage(`Maximum allowed files per upload is ${MAX_UPLOAD_FILES}.`);
      return;
    }

    setBusy(true);
    setUploadMessage('');
    setStatus('Uploading files...');
    try {
      const formData = new FormData();
      pendingUploads.forEach((item) => {
        formData.append('files', item.file);
      });
      const metadata = pendingUploads.map((item) => ({
        filename: item.file.name,
        tag_id: item.tagId || '',
        expiry_time: toIsoStringFromDatetimeLocal(item.expiry) || '',
        advance_security: Boolean(item.advance_security),
      }));
      formData.append('metadata', JSON.stringify(metadata));

      const uploadRes = await authorizedFetch('/upload/multiple', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) {
        let detail = 'Upload failed.';
        try {
          const payload = await uploadRes.json();
          detail = payload.detail || detail;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      const uploaded = await uploadRes.json();
      const uploadedFiles = Array.isArray(uploaded.files) ? uploaded.files : [];
      if (!uploadedFiles.length) {
        throw new Error('Upload response missing files.');
      }

      for (const entry of uploadedFiles) {
        const uploadedName = entry.file_name || entry.stored_filename;
        if (!uploadedName) continue;
        setStatus(`Encrypting ${uploadedName}...`);
        const encryptRes = await authorizedFetch('/encrypt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_name: uploadedName }),
        });
        if (!encryptRes.ok) {
          throw new Error(`Encryption failed for ${uploadedName}.`);
        }
        await encryptRes.json();
      }

      const updated = await fetchFiles();
      if (updated?.files?.length) {
        setSelectedFile(updated.files[0]);
      }
      setStatus('Upload completed.');
      setShowUploader(false);
      setPendingUploads([]);
      setGlobalTagId('');
      setGlobalExpiry('');
      setApplyToAll(true);
      setGlobalAdvanceSecurity(true);
      setShowSecurityWarning(false);
    } catch (error) {
      setUploadMessage(error.message || 'Something went wrong.');
      setStatus(error.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, [authorizedFetch, fetchFiles, pendingUploads, setSelectedFile, setStatus, setBusy]);

  return {
    showUploader,
    uploadTags,
    pendingUploads,
    applyToAll,
    globalTagId,
    globalExpiry,
    globalAdvanceSecurity,
    showSecurityWarning,
    uploadMessage,
    fileInputRef,
    handleUploadClick,
    handleCloseUploader,
    handleBrowseClick,
    handleFileChange,
    handleUploadSelected,
    handleApplyToAllChange,
    handleGlobalTagChange,
    handleGlobalExpiryChange,
    handleGlobalAdvanceSecurityChange,
    handleCloseSecurityWarning,
    handleFileTagChange,
    handleFileExpiryChange,
    handleFileAdvanceSecurityChange,
    handleRemovePendingUpload,
    MAX_UPLOAD_FILES,
  };
}
