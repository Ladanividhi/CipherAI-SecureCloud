import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import PreviewOverlay from '../components/PreviewOverlay';
import UploadOverlay from '../components/uploads/UploadOverlay';
import useAuth from '../hooks/useAuth';
import useFiles from '../hooks/useFiles';
import useUploader from '../hooks/useUploader';

export default function AppShellLayout() {
  const { currentUser, idToken, handleLogout } = useAuth();
  const filesState = useFiles(idToken);
  const uploaderState = useUploader({
    idToken,
    fetchFiles: filesState.fetchFiles,
    setSelectedFile: filesState.setSelectedFile,
    setStatus: filesState.setStatus,
    busy: filesState.busy,
    setBusy: filesState.setBusy,
  });

  return (
    <>
      <input
        type="file"
        multiple
        ref={uploaderState.fileInputRef}
        onChange={uploaderState.handleFileChange}
        className="sr-only"
      />

      <UploadOverlay
        visible={uploaderState.showUploader}
        onClose={uploaderState.handleCloseUploader}
        onBrowse={uploaderState.handleBrowseClick}
        onUpload={uploaderState.handleUploadSelected}
        busy={filesState.busy}
        maxFiles={uploaderState.MAX_UPLOAD_FILES}
        selectedFiles={uploaderState.pendingUploads}
        tags={uploaderState.uploadTags}
        applyToAll={uploaderState.applyToAll}
        onApplyToAllChange={uploaderState.handleApplyToAllChange}
        globalTagId={uploaderState.globalTagId}
        onGlobalTagChange={uploaderState.handleGlobalTagChange}
        globalExpiry={uploaderState.globalExpiry}
        onGlobalExpiryChange={uploaderState.handleGlobalExpiryChange}
        globalAdvanceSecurity={uploaderState.globalAdvanceSecurity}
        onGlobalAdvanceSecurityChange={uploaderState.handleGlobalAdvanceSecurityChange}
        securityWarningVisible={uploaderState.showSecurityWarning}
        onCloseSecurityWarning={uploaderState.handleCloseSecurityWarning}
        onFileTagChange={uploaderState.handleFileTagChange}
        onFileExpiryChange={uploaderState.handleFileExpiryChange}
        onFileAdvanceSecurityChange={uploaderState.handleFileAdvanceSecurityChange}
        onRemoveFile={uploaderState.handleRemovePendingUpload}
        message={uploaderState.uploadMessage}
      />

      <div className="app-shell">
        <Sidebar
          profile={currentUser}
          onLogout={handleLogout}
          storage={filesState.storageUsage}
        />
        <Outlet
          context={{
            filesState,
            uploaderState,
            currentUser,
            idToken,
          }}
        />
      </div>

      <PreviewOverlay
        visible={filesState.showPreview && Boolean(filesState.selectedFile)}
        file={filesState.selectedFile}
        previewUrl={filesState.previewUrl}
        status={filesState.status}
        onDownload={filesState.handleDownload}
        onShare={filesState.handleShare}
        onClose={filesState.handleClosePreview}
        busy={filesState.busy}
      />
    </>
  );
}
