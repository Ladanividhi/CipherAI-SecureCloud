import React from 'react';
import Sidebar from '../components/Sidebar';
import MainContent from '../components/MainContent';
import PreviewOverlay from '../components/PreviewOverlay';
import UploadOverlay from '../components/uploads/UploadOverlay';
import useAuth from '../hooks/useAuth';
import useFiles from '../hooks/useFiles';
import useUploader from '../hooks/useUploader';

export default function Dashboard() {
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
      <input type="file" multiple ref={uploaderState.fileInputRef} onChange={uploaderState.handleFileChange} className="sr-only" />
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
        onFileTagChange={uploaderState.handleFileTagChange}
        onFileExpiryChange={uploaderState.handleFileExpiryChange}
        message={uploaderState.uploadMessage}
      />
      <div className="app-shell">
        <Sidebar profile={currentUser} onLogout={handleLogout} storage={filesState.storageUsage} />
        <MainContent
          files={filesState.files}
          onUploadClick={uploaderState.handleUploadClick}
          onFileSelect={filesState.handleFileSelect}
          selectedFile={filesState.selectedFile}
          busy={filesState.busy}
          status={filesState.status}
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
