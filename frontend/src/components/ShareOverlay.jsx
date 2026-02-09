import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Share2, X, Search, User, Shield, Clock, Send } from 'lucide-react';

export default function ShareOverlay({ visible, file, onClose, authorizedFetch, onStatus }) {
  const [email, setEmail] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [permission, setPermission] = useState('view');
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [searching, setSearching] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' | 'error'
  const debounceRef = useRef(null);

  // Reset state when overlay opens/closes
  useEffect(() => {
    if (visible) {
      setEmail('');
      setSearchResults([]);
      setSelectedUser(null);
      setPermission('view');
      setExpiryEnabled(false);
      setExpiryDate('');
      setMessage('');
      setMessageType('');
    }
  }, [visible]);

  // Debounced user search
  const searchUsers = useCallback(
    async (query) => {
      if (!query || query.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await authorizedFetch(`/users/search?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setSearchResults(Array.isArray(data.users) ? data.users : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [authorizedFetch],
  );

  const handleEmailChange = (e) => {
    const value = e.target.value;
    setEmail(value);
    setSelectedUser(null);
    setMessage('');

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchUsers(value), 300);
  };

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setEmail(user.email);
    setSearchResults([]);
    setMessage('');
  };

  const handleShare = async () => {
    if (!selectedUser) {
      setMessage('Please select a registered user from the search results.');
      setMessageType('error');
      return;
    }

    const fileName = file?.file_name || file?.filename;
    if (!fileName) return;

    setSharing(true);
    setMessage('');
    try {
      const body = {
        file_name: fileName,
        recipient_email: selectedUser.email,
        permission,
      };
      if (expiryEnabled && expiryDate) {
        body.expiry_time = new Date(expiryDate).toISOString();
      }

      const res = await authorizedFetch('/files/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Share failed');
      }

      setMessage(data.message || 'File shared successfully!');
      setMessageType('success');
      if (onStatus) onStatus(data.message);

      // Reset form after success
      setTimeout(() => {
        setEmail('');
        setSelectedUser(null);
        setPermission('view');
        setExpiryEnabled(false);
        setExpiryDate('');
      }, 1500);
    } catch (err) {
      setMessage(err.message || 'Failed to share file.');
      setMessageType('error');
    } finally {
      setSharing(false);
    }
  };

  if (!visible || !file) return null;

  const fileName = file.file_name || file.filename;

  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="share-modal__header">
          <div className="share-modal__title">
            <Share2 size={20} color="#818cf8" />
            <h3>Share File</h3>
          </div>
          <button className="share-close-btn" type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        {/* File info */}
        <div className="share-file-info">
          <span className="share-file-name">{fileName}</span>
        </div>

        {/* Email search */}
        <div className="share-field">
          <label className="share-label">
            <User size={16} />
            Share with (email)
          </label>
          <div className="share-search-wrapper">
            <Search size={16} className="share-search-icon" />
            <input
              type="email"
              className="share-input"
              placeholder="Search by email address..."
              value={email}
              onChange={handleEmailChange}
              disabled={sharing}
            />
          </div>

          {/* Search results dropdown */}
          {searchResults.length > 0 && !selectedUser && (
            <div className="share-search-results">
              {searchResults.map((user) => (
                <button
                  key={user.uid}
                  type="button"
                  className="share-search-result-item"
                  onClick={() => handleSelectUser(user)}
                >
                  <div className="share-result-avatar">
                    {(user.name || user.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="share-result-info">
                    {user.name && <span className="share-result-name">{user.name}</span>}
                    <span className="share-result-email">{user.email}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {searching && <p className="share-hint">Searching...</p>}

          {email.length >= 2 && !searching && searchResults.length === 0 && !selectedUser && (
            <p className="share-hint share-hint--warning">No registered users found with that email.</p>
          )}

          {selectedUser && (
            <div className="share-selected-user">
              <div className="share-result-avatar">
                {(selectedUser.name || selectedUser.email || '?')[0].toUpperCase()}
              </div>
              <div className="share-result-info">
                {selectedUser.name && <span className="share-result-name">{selectedUser.name}</span>}
                <span className="share-result-email">{selectedUser.email}</span>
              </div>
              <button
                type="button"
                className="share-remove-user"
                onClick={() => {
                  setSelectedUser(null);
                  setEmail('');
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Permissions */}
        <div className="share-field">
          <label className="share-label">
            <Shield size={16} />
            Permissions
          </label>
          <div className="share-radio-group">
            <label className={`share-radio ${permission === 'view' ? 'share-radio--active' : ''}`}>
              <input
                type="radio"
                name="permission"
                value="view"
                checked={permission === 'view'}
                onChange={() => setPermission('view')}
                disabled={sharing}
              />
              <span className="share-radio-dot" />
              <div>
                <span className="share-radio-label">View Only</span>
                <span className="share-radio-desc">Can preview the file</span>
              </div>
            </label>
            <label className={`share-radio ${permission === 'download' ? 'share-radio--active' : ''}`}>
              <input
                type="radio"
                name="permission"
                value="download"
                checked={permission === 'download'}
                onChange={() => setPermission('download')}
                disabled={sharing}
              />
              <span className="share-radio-dot" />
              <div>
                <span className="share-radio-label">View & Download</span>
                <span className="share-radio-desc">Can preview and download</span>
              </div>
            </label>
          </div>
        </div>

        {/* Expiry (optional) */}
        <div className="share-field">
          <label className="share-label">
            <Clock size={16} />
            Expiry Time
            <span className="share-optional">(optional)</span>
          </label>
          <div className="share-expiry-toggle">
            <label className="share-toggle">
              <input
                type="checkbox"
                checked={expiryEnabled}
                onChange={(e) => setExpiryEnabled(e.target.checked)}
                disabled={sharing}
              />
              <span className="share-toggle-slider" />
            </label>
            <span className="share-toggle-text">
              {expiryEnabled ? 'Access expires on:' : 'No expiration'}
            </span>
          </div>
          {expiryEnabled && (
            <input
              type="datetime-local"
              className="share-input share-input--date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              disabled={sharing}
              min={new Date().toISOString().slice(0, 16)}
            />
          )}
        </div>

        {/* Message */}
        {message && (
          <div className={`share-message ${messageType === 'success' ? 'share-message--success' : 'share-message--error'}`}>
            {message}
          </div>
        )}

        {/* Actions */}
        <div className="share-actions">
          <button type="button" className="share-cancel-btn" onClick={onClose} disabled={sharing}>
            Cancel
          </button>
          <button
            type="button"
            className="share-submit-btn"
            onClick={handleShare}
            disabled={sharing || !selectedUser}
          >
            {sharing ? (
              'Sharing...'
            ) : (
              <>
                <Send size={16} />
                Share
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
