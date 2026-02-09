import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderOpen,
  Bot,
  Search,
  PieChart,
  Share2,
  Trash2,
  Settings,
  LogOut
} from 'lucide-react';

const fallbackUser = {
  name: 'Alex Morgan',
  plan: 'Pro Plan Member',
  avatar: 'https://ui-avatars.com/api/?name=Alex+Morgan&background=253252&color=fff',
  storageUsed: 75,
  storageQuota: 100,
};

const navLinks = [
  { label: 'Dashboard', badge: null, to: '/dashboard', icon: LayoutDashboard },
  { label: 'My Files', badge: null, to: '/my-files', icon: FolderOpen },
  { label: 'AI Assistant', badge: 'NEW', icon: Bot },
  { label: 'Smart Search', icon: Search },
  { label: 'Analytics', icon: PieChart },
  { label: 'Shared with me', to: '/shared', icon: Share2 },
  { label: 'Trash Bin', icon: Trash2 },
];

export default function Sidebar({ profile, onLogout, storage }) {
  const navigate = useNavigate();
  const location = useLocation();

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
          <button
            key={link.label}
            className={link.to && location.pathname.startsWith(link.to) ? 'active' : ''}
            type="button"
            onClick={() => (link.to ? navigate(link.to) : null)}
          >
            {link.icon && <link.icon size={20} style={{ marginRight: '10px' }} />}
            <span>{link.label}</span>
            {link.badge && <small>{link.badge}</small>}
          </button>
        ))}
      </nav>
      <div className="sidebar-actions">
        <button className="settings-btn" type="button">
          <Settings size={18} style={{ marginRight: '8px' }} />
          Settings
        </button>
        <button className="logout-btn" type="button" onClick={onLogout}>
          <LogOut size={18} style={{ marginRight: '8px' }} />
          Log out
        </button>
      </div>
    </aside>
  );
}
