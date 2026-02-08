import React from 'react';
import { Folder } from 'lucide-react';

export default function FolderCard({ folder }) {
  // Use folder.color if available, otherwise default to accent color
  const iconColor = folder.color || '#6366f1';

  return (
    <div className="folder-card">
      <div className="folder-icon" style={{ backgroundColor: `${iconColor}33`, display: 'grid', placeItems: 'center' }}>
        <Folder size={20} color={iconColor} fill={iconColor} fillOpacity={0.4} />
      </div>
      <p>{folder.name}</p>
      <span>{folder.files} files</span>
    </div>
  );
}
