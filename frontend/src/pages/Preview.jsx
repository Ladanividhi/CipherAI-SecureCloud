import React from 'react';
import useAuth from '../hooks/useAuth';
import useFiles from '../hooks/useFiles';
import PreviewOverlay from '../components/PreviewOverlay';

// Optional standalone preview page (reuses same logic)
export default function PreviewPage() {
  const { idToken } = useAuth();
  const filesState = useFiles(idToken);

  return (
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
  );
}
