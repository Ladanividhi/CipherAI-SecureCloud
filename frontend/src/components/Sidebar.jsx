import React from 'react';

const fallbackUser = {
  name: 'Alex Morgan',
  plan: 'Pro Plan Member',
  avatar: 'https://ui-avatars.com/api/?name=Alex+Morgan&background=253252&color=fff',
  storageUsed: 75,
  storageQuota: 100,
};

const navLinks = [
  { label: 'My Files', badge: null },
  { label: 'AI Assistant', badge: 'NEW' },
  { label: 'Smart Search' },
  { label: 'Analytics' },
  { label: 'Shared Files' },
  { label: 'Trash Bin' },
];

export default function Sidebar({ profile, onLogout, storage }) {
  const resolvedUser = {
    name: profile?.displayName || profile?.email || fallbackUser.name,
    plan: profile ? 'SecureCloud Member' : fallbackUser.plan,
    avatar: profile?.photoURL || fallbackUser.avatar,
  };

  const fallbackPercent = (fallbackUser.storageUsed / fallbackUser.storageQuota) * 100;
  const storageLabel = storage?.label || `${fallbackUser.storageUsed}GB of ${fallbackUser.storageQuota}GB`;
  const storagePercent = typeof storage?.percent === 'number' ? storage.percent : fallbackPercent;

  return (
    <aside className="sidebar">
      <div className="user-card">
        <img src={resolvedUser.avatar} alt={resolvedUser.name} />
        <div>
          <p className="user-name">{resolvedUser.name}</p>
          <p className="user-plan">{resolvedUser.plan}</p>
        </div>
      </div>
      <div className="storage-card">
        <div className="storage-header">
          <span>Storage</span>
          <span className="storage-value">{storageLabel}</span>
        </div>
        <div className="progress-bar">
          <div style={{ width: `${storagePercent}%` }} />
        </div>
        <button className="upgrade-btn" type="button">Upgrade</button>
      </div>
      <nav className="nav-links">
        {navLinks.map((link) => (
          <button key={link.label} className={link.label === 'My Files' ? 'active' : ''} type="button">
            <span>{link.label}</span>
            {link.badge && <small>{link.badge}</small>}
          </button>
        ))}
      </nav>
      <div className="sidebar-actions">
        <button className="settings-btn" type="button">Settings</button>
        <button className="logout-btn" type="button" onClick={onLogout}>Log out</button>
      </div>
    </aside>
  );
}
