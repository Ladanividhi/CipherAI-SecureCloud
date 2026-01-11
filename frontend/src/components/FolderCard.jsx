import React from 'react';

export default function FolderCard({ folder }) {
  return (
    <div className="folder-card">
      <div className="folder-icon" style={{ backgroundColor: folder.color }} />
      <p>{folder.name}</p>
      <span>{folder.files} files</span>
    </div>
  );
}
