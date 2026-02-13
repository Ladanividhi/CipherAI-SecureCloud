import React, { useState, useCallback, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  User, Lock, Shield, Bell, Palette, HardDrive,
  Eye, EyeOff, Save, Camera, Trash2, KeyRound,
  Mail, Clock, ToggleLeft, ToggleRight, Moon, Sun, Monitor
} from 'lucide-react';
import {
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
} from 'firebase/auth';
import { auth } from '../firebase';
import { formatBytes } from '../utils/formatters';

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'danger', label: 'Danger Zone', icon: Trash2 },
];

export default function Settings() {
  const { currentUser, filesState } = useOutletContext();

  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Profile
  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');

  // Security
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState('30');

  // Notifications
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [shareNotifs, setShareNotifs] = useState(true);
  const [uploadNotifs, setUploadNotifs] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [expiryReminders, setExpiryReminders] = useState(true);

  // Appearance
  const [theme, setTheme] = useState('dark');
  const [compactMode, setCompactMode] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  // Danger
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.displayName || '');
      setPhotoURL(currentUser.photoURL || '');
    }
  }, [currentUser]);

  const flash = useCallback((text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  }, []);

  // ─── Profile ───
  const handleSaveProfile = async () => {
    if (!displayName.trim()) { flash('Display name cannot be empty.', 'error'); return; }
    setSaving(true);
    try {
      await updateProfile(auth.currentUser, {
        displayName: displayName.trim(),
        photoURL: photoURL.trim() || null,
      });
      flash('Profile updated successfully.');
    } catch (err) {
      flash(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Password ───
  const handleChangePassword = async () => {
    if (!currentPassword) { flash('Enter your current password.', 'error'); return; }
    if (newPassword.length < 6) { flash('New password must be at least 6 characters.', 'error'); return; }
    if (newPassword !== confirmPassword) { flash('Passwords do not match.', 'error'); return; }

    setSaving(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      flash('Password changed successfully.');
    } catch (err) {
      flash(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete Account ───
  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') { flash('Type DELETE to confirm.', 'error'); return; }

    setSaving(true);
    try {
      if (deletePassword) {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, deletePassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
      }
      await deleteUser(auth.currentUser);
    } catch (err) {
      flash(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const isEmailUser = currentUser?.providerData?.some(p => p.providerId === 'password');

  const storageData = filesState?.storageUsage || {};
  const fileCount = filesState?.files?.length || 0;

  // ─── Render Tabs ───
  const renderContent = () => {
    switch (activeTab) {

      // ═══════════ PROFILE ═══════════
      case 'profile':
        return (
          <div className="settings-section">
            <h2 className="settings-section__title"><User size={20} /> Profile Information</h2>
            <p className="settings-section__desc">Update your personal information and how others see you.</p>

            <div className="settings-avatar-row">
              <div className="settings-avatar">
                <img
                  src={photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'U')}&background=253252&color=fff`}
                  alt="Avatar"
                />
                <div className="settings-avatar__overlay">
                  <Camera size={18} />
                </div>
              </div>
              <div className="settings-avatar-info">
                <p className="settings-avatar-info__name">{displayName || 'No name set'}</p>
                <p className="settings-avatar-info__email">{currentUser?.email}</p>
                <span className="settings-badge">
                  {isEmailUser ? 'Email Account' : 'Google Account'}
                </span>
              </div>
            </div>

            <div className="settings-form-grid">
              <label className="settings-field">
                <span className="settings-field__label">Display Name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  disabled={saving}
                />
              </label>

              <label className="settings-field">
                <span className="settings-field__label">Email Address</span>
                <input type="email" value={currentUser?.email || ''} disabled className="settings-input--disabled" />
                <span className="settings-field__hint">Email cannot be changed</span>
              </label>

              <label className="settings-field settings-field--full">
                <span className="settings-field__label">Avatar URL</span>
                <input
                  type="url"
                  value={photoURL}
                  onChange={e => setPhotoURL(e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                  disabled={saving}
                />
                <span className="settings-field__hint">Paste a link to your profile image</span>
              </label>
            </div>

            <div className="settings-actions">
              <button className="primary-btn" onClick={handleSaveProfile} disabled={saving}>
                <Save size={16} style={{ marginRight: '6px' }} />
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        );

      // ═══════════ SECURITY ═══════════
      case 'security':
        return (
          <div className="settings-section">
            <h2 className="settings-section__title"><Lock size={20} /> Security Settings</h2>
            <p className="settings-section__desc">Manage your password, two-factor authentication, and session preferences.</p>

            {/* Change password */}
            {isEmailUser && (
              <div className="settings-card">
                <h3 className="settings-card__title"><KeyRound size={18} /> Change Password</h3>
                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span className="settings-field__label">Current Password</span>
                    <div className="settings-pwd-wrapper">
                      <input
                        type={showCurrentPwd ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        disabled={saving}
                      />
                      <button type="button" className="settings-pwd-toggle" onClick={() => setShowCurrentPwd(v => !v)}>
                        {showCurrentPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </label>

                  <label className="settings-field">
                    <span className="settings-field__label">New Password</span>
                    <div className="settings-pwd-wrapper">
                      <input
                        type={showNewPwd ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        disabled={saving}
                      />
                      <button type="button" className="settings-pwd-toggle" onClick={() => setShowNewPwd(v => !v)}>
                        {showNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </label>

                  <label className="settings-field">
                    <span className="settings-field__label">Confirm New Password</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      disabled={saving}
                    />
                  </label>
                </div>
                <div className="settings-actions">
                  <button className="primary-btn" onClick={handleChangePassword} disabled={saving}>
                    {saving ? 'Changing...' : 'Update Password'}
                  </button>
                </div>
              </div>
            )}

            {!isEmailUser && (
              <div className="settings-card">
                <h3 className="settings-card__title"><KeyRound size={18} /> Password</h3>
                <p className="muted">You signed in with Google. Password management is handled by your Google account.</p>
              </div>
            )}

            {/* Two Factor */}
            <div className="settings-card">
              <h3 className="settings-card__title"><Shield size={18} /> Two-Factor Authentication</h3>
              <div className="settings-toggle-row">
                <div>
                  <p className="settings-toggle-row__label">Enable 2FA</p>
                  <p className="settings-toggle-row__desc">Add an extra layer of security to your account.</p>
                </div>
                <button
                  type="button"
                  className={`settings-toggle ${twoFactor ? 'settings-toggle--on' : ''}`}
                  onClick={() => { setTwoFactor(v => !v); flash(twoFactor ? '2FA disabled.' : '2FA enabled.'); }}
                >
                  {twoFactor ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                </button>
              </div>
            </div>

            {/* Session Timeout */}
            <div className="settings-card">
              <h3 className="settings-card__title"><Clock size={18} /> Session Timeout</h3>
              <label className="settings-field">
                <span className="settings-field__label">Auto-logout after inactivity</span>
                <select value={sessionTimeout} onChange={e => setSessionTimeout(e.target.value)}>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="120">2 hours</option>
                  <option value="0">Never</option>
                </select>
              </label>
            </div>
          </div>
        );

      // ═══════════ NOTIFICATIONS ═══════════
      case 'notifications':
        return (
          <div className="settings-section">
            <h2 className="settings-section__title"><Bell size={20} /> Notification Preferences</h2>
            <p className="settings-section__desc">Choose what notifications you want to receive.</p>

            <div className="settings-card">
              <h3 className="settings-card__title"><Mail size={18} /> Email Notifications</h3>

              {[
                { label: 'File sharing alerts', desc: 'Get notified when someone shares a file with you.', value: shareNotifs, setter: setShareNotifs },
                { label: 'Upload confirmations', desc: 'Receive email when your files finish uploading.', value: uploadNotifs, setter: setUploadNotifs },
                { label: 'Security alerts', desc: 'Get notified about suspicious login attempts.', value: securityAlerts, setter: setSecurityAlerts },
                { label: 'Expiry reminders', desc: 'Remind you before shared files expire.', value: expiryReminders, setter: setExpiryReminders },
                { label: 'All email notifications', desc: 'Master switch for all email notifications.', value: emailNotifs, setter: setEmailNotifs },
              ].map((item, i) => (
                <div className="settings-toggle-row" key={i}>
                  <div>
                    <p className="settings-toggle-row__label">{item.label}</p>
                    <p className="settings-toggle-row__desc">{item.desc}</p>
                  </div>
                  <button
                    type="button"
                    className={`settings-toggle ${item.value ? 'settings-toggle--on' : ''}`}
                    onClick={() => item.setter(v => !v)}
                  >
                    {item.value ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );

      // ═══════════ APPEARANCE ═══════════
      case 'appearance':
        return (
          <div className="settings-section">
            <h2 className="settings-section__title"><Palette size={20} /> Appearance</h2>
            <p className="settings-section__desc">Customize how CipherAI SecureCloud looks for you.</p>

            <div className="settings-card">
              <h3 className="settings-card__title">Theme</h3>
              <div className="settings-theme-grid">
                {[
                  { id: 'dark', label: 'Dark', icon: Moon, desc: 'Easy on the eyes' },
                  { id: 'light', label: 'Light', icon: Sun, desc: 'Classic look' },
                  { id: 'system', label: 'System', icon: Monitor, desc: 'Follow OS setting' },
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`settings-theme-card ${theme === t.id ? 'settings-theme-card--active' : ''}`}
                    onClick={() => setTheme(t.id)}
                  >
                    <t.icon size={24} />
                    <span className="settings-theme-card__label">{t.label}</span>
                    <span className="settings-theme-card__desc">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-card">
              <div className="settings-toggle-row">
                <div>
                  <p className="settings-toggle-row__label">Compact Mode</p>
                  <p className="settings-toggle-row__desc">Reduce spacing and show more content.</p>
                </div>
                <button
                  type="button"
                  className={`settings-toggle ${compactMode ? 'settings-toggle--on' : ''}`}
                  onClick={() => setCompactMode(v => !v)}
                >
                  {compactMode ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                </button>
              </div>
              <div className="settings-toggle-row">
                <div>
                  <p className="settings-toggle-row__label">Animations</p>
                  <p className="settings-toggle-row__desc">Enable smooth transitions and animations.</p>
                </div>
                <button
                  type="button"
                  className={`settings-toggle ${animationsEnabled ? 'settings-toggle--on' : ''}`}
                  onClick={() => setAnimationsEnabled(v => !v)}
                >
                  {animationsEnabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                </button>
              </div>
            </div>
          </div>
        );

      // ═══════════ STORAGE ═══════════
      case 'storage':
        return (
          <div className="settings-section">
            <h2 className="settings-section__title"><HardDrive size={20} /> Storage</h2>
            <p className="settings-section__desc">Monitor your storage usage and manage your plan.</p>

            <div className="settings-card">
              <div className="settings-storage-visual">
                <div className="settings-storage-ring">
                  <svg viewBox="0 0 120 120" width="120" height="120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r="50" fill="none"
                      stroke="#6366f1" strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${(storageData.percent || 0) * 3.14} 314`}
                      transform="rotate(-90 60 60)"
                    />
                  </svg>
                  <div className="settings-storage-ring__text">
                    <span className="settings-storage-ring__pct">{(storageData.percent || 0).toFixed(1)}%</span>
                    <span className="settings-storage-ring__label">used</span>
                  </div>
                </div>
                <div className="settings-storage-stats">
                  <div className="settings-stat">
                    <span className="settings-stat__value">{formatBytes(storageData.usedBytes || 0)}</span>
                    <span className="settings-stat__label">Used</span>
                  </div>
                  <div className="settings-stat">
                    <span className="settings-stat__value">{storageData.quotaMb || 100} MB</span>
                    <span className="settings-stat__label">Total Quota</span>
                  </div>
                  <div className="settings-stat">
                    <span className="settings-stat__value">{fileCount}</span>
                    <span className="settings-stat__label">Files</span>
                  </div>
                </div>
              </div>

              <div className="settings-storage-bar-section">
                <div className="settings-storage-bar">
                  <div style={{ width: `${Math.min(storageData.percent || 0, 100)}%` }} />
                </div>
                <p className="muted" style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                  {storageData.label || 'No data'}
                </p>
              </div>
            </div>

            <div className="settings-card">
              <h3 className="settings-card__title">Upgrade Plan</h3>
              <p className="muted">Need more storage? Upgrade to a premium plan for increased capacity and features.</p>
              <button className="primary-btn" style={{ marginTop: '12px' }} disabled>
                Coming Soon
              </button>
            </div>
          </div>
        );

      // ═══════════ DANGER ZONE ═══════════
      case 'danger':
        return (
          <div className="settings-section">
            <h2 className="settings-section__title settings-section__title--danger"><Trash2 size={20} /> Danger Zone</h2>
            <p className="settings-section__desc">Irreversible actions. Proceed with extreme caution.</p>

            <div className="settings-card settings-card--danger">
              <h3 className="settings-card__title">Delete Account</h3>
              <p className="muted">
                This will permanently delete your account, all uploaded files, and shared data.
                This action <strong>cannot be undone</strong>.
              </p>

              {isEmailUser && (
                <label className="settings-field" style={{ marginTop: '16px' }}>
                  <span className="settings-field__label">Your Password</span>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={e => setDeletePassword(e.target.value)}
                    placeholder="Enter password to confirm"
                    disabled={saving}
                  />
                </label>
              )}

              <label className="settings-field" style={{ marginTop: '12px' }}>
                <span className="settings-field__label">Type <strong>DELETE</strong> to confirm</span>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  disabled={saving}
                />
              </label>

              <div className="settings-actions" style={{ marginTop: '16px' }}>
                <button
                  className="danger-btn"
                  onClick={handleDeleteAccount}
                  disabled={saving || deleteConfirm !== 'DELETE'}
                >
                  <Trash2 size={16} style={{ marginRight: '6px' }} />
                  {saving ? 'Deleting...' : 'Permanently Delete Account'}
                </button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <main className="main-content">
      <header className="main-header">
        <div>
          <h1>Settings</h1>
          <p>Manage your account, security, and preferences.</p>
        </div>
      </header>

      {message.text && (
        <div className={`status-banner ${message.type === 'error' ? 'status-banner--error' : ''}`}>
          {message.text}
        </div>
      )}

      <div className="settings-layout">
        <nav className="settings-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`settings-tab ${activeTab === tab.id ? 'settings-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={18} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {renderContent()}
        </div>
      </div>
    </main>
  );
}
