import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	createUserWithEmailAndPassword,
	onIdTokenChanged,
	signInWithEmailAndPassword,
	signInWithPopup,
	signOut,
	updateProfile,
} from 'firebase/auth';

import LoginForm from './components/auth/LoginForm';
import SignupForm from './components/auth/SignupForm';
import UploadOverlay from './components/uploads/UploadOverlay';
import { auth, googleProvider } from './firebase';

const guessApiBaseUrl = () => {
	if (typeof window === 'undefined') {
		return 'http://127.0.0.1:8000';
	}
	const { protocol, hostname } = window.location;
	return `${protocol}//${hostname}:8000`;
};

const cleanBaseUrl = (url) => url.replace(/\/$/, '');

const envApiUrl = import.meta.env.VITE_API_URL?.trim();
const API_BASE_URL = cleanBaseUrl(envApiUrl || guessApiBaseUrl());

const fallbackUser = {
	name: 'Alex Morgan',
	plan: 'Pro Plan Member',
	avatar: 'https://ui-avatars.com/api/?name=Alex+Morgan&background=253252&color=fff',
	storageUsed: 75,
	storageQuota: 100,
};

const folders = [
	{ id: 1, name: 'Brand Assets', color: '#ffd166', files: 24 },
	{ id: 2, name: 'Campaigns', color: '#8e9dff', files: 156 },
	{ id: 3, name: 'Legal Docs', color: '#8ac4ff', files: 19 },
];

const navLinks = [
	{ label: 'My Files', badge: null },
	{ label: 'AI Assistant', badge: 'NEW' },
	{ label: 'Smart Search' },
	{ label: 'Analytics' },
	{ label: 'Shared Files' },
	{ label: 'Trash Bin' },
];

const statusLabels = {
	uploaded: 'Uploaded',
	encrypted: 'Encrypted',
	decrypted: 'Ready',
};

const formatBytes = (size) => {
	if (typeof size !== 'number') return '—';
	if (size === 0) return '0 B';
	const units = ['KB', 'MB', 'GB', 'TB'];
	let value = size / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value.toFixed(1)} ${units[unitIndex]}`;
};

const formatDate = (iso) => {
	if (!iso) return '—';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return iso;
	}
	return date.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
};

const friendlyAuthMessage = (error) => {
	if (error?.code) {
		switch (error.code) {
			case 'auth/email-already-in-use':
				return 'That email is already registered. Try signing in instead.';
			case 'auth/invalid-credential':
			case 'auth/wrong-password':
				return 'Incorrect email or password. Please try again.';
			case 'auth/user-not-found':
				return 'No account found for that email. Create one to continue.';
			case 'auth/popup-closed-by-user':
				return 'Google sign-in was closed before completing.';
			default:
				break;
		}
	}
	return error?.message || 'Unable to authenticate. Please try again.';
};

function Sidebar({ profile, onLogout, storage }) {
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
				<button className="upgrade-btn" type="button">
					Upgrade
				</button>
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
				<button className="settings-btn" type="button">
					Settings
				</button>
				<button className="logout-btn" type="button" onClick={onLogout}>
					Log out
				</button>
			</div>
		</aside>
	);
}

function FolderCard({ folder }) {
	return (
		<div className="folder-card">
			<div className="folder-icon" style={{ backgroundColor: folder.color }} />
			<p>{folder.name}</p>
			<span>{folder.files} files</span>
		</div>
	);
}

function StatusPill({ status }) {
	if (!status) return null;
	const label = statusLabels[status] || status;
	return <span className={`status-pill status-${status}`}>{label}</span>;
}

function MyFilesSection({ files, onFileSelect, selectedFile }) {
	return (
		<section className="files-section">
			<div className="files-header">
				<h2>My Files</h2>
				<span className="muted">{files.length} files</span>
			</div>
			{files.length ? (
				<div className="my-files-list">
					{files.map((file) => (
						<button
							key={file.id || file.filename}
							type="button"
							className={`my-file-row ${selectedFile?.filename === file.filename ? 'highlight' : ''}`}
							onClick={() => onFileSelect(file)}
						>
							<div>
								<p>{file.filename}</p>
								<small>
									{formatDate(file.uploaded_at)} • {formatBytes(file.size_bytes)}
								</small>
							</div>
							<StatusPill status={file.status} />
						</button>
					))}
				</div>
			) : (
				<p className="empty-state">No files yet. Upload something to get started.</p>
			)}
		</section>
	);
}

function MainContent({ files, onUploadClick, onFileSelect, selectedFile, busy, status }) {
	return (
		<main className="main-content">
			<header className="main-header">
				<div>
					<h1>Projects › Marketing › Q3</h1>
					<p>Files stored locally and ready for encryption.</p>
				</div>
				<div className="header-actions">
					<input type="search" placeholder="Search files, folders, or ask AI..." />
					<button className="primary-btn" onClick={onUploadClick} disabled={busy} type="button">
						{busy ? 'Working...' : 'Upload New File'}
					</button>
				</div>
			</header>

			{status && <div className="status-banner">{status}</div>}

			<section className="folders-section">
				<h2>Folders</h2>
				<div className="folder-grid">
					{folders.map((folder) => (
						<FolderCard key={folder.id} folder={folder} />
					))}
				</div>
			</section>

			<MyFilesSection files={files} onFileSelect={onFileSelect} selectedFile={selectedFile} />
		</main>
	);
}

function PreviewOverlay({ visible, file, previewUrl, status, onDownload, onShare, onClose, busy }) {
	if (!visible || !file) {
		return null;
	}

	const lowerName = file.filename?.toLowerCase() || '';
	const isPdf = lowerName.endsWith('.pdf');
	const isImage = /\.(png|jpe?g|gif|webp)$/i.test(lowerName);

	const renderPreview = () => {
		if (!previewUrl) {
			return <span>Decrypting and preparing preview...</span>;
		}

		if (isPdf) {
			return <iframe src={previewUrl} title={file.filename} />;
		}

		if (isImage) {
			return <img src={previewUrl} alt={file.filename} />;
		}

		return (
			<div className="preview-fallback">
				<p>No inline preview for this format. Download to view.</p>
				<button className="primary-btn" type="button" onClick={onDownload} disabled={busy}>
					Download
				</button>
			</div>
		);
	};

	return (
		<div className="preview-overlay" role="dialog" aria-modal="true" onClick={onClose}>
			<div className="preview-modal" onClick={(event) => event.stopPropagation()}>
				<header className="preview-modal__header">
					<div>
						<p className="details-title">{file.filename}</p>
						<small>
							Uploaded {formatDate(file.uploaded_at)} • {formatBytes(file.size_bytes)}
						</small>
					</div>
					<div className="preview-actions">
						<button className="share-btn" type="button" onClick={onShare} disabled={busy}>
							Share
						</button>
						<button className="download-btn" type="button" onClick={onDownload} disabled={busy}>
							{busy && !previewUrl ? 'Preparing...' : 'Download'}
						</button>
						<button className="preview-close-btn" type="button" onClick={onClose}>
							Close
						</button>
					</div>
				</header>
				<div className="preview-modal__content">
					<div className={`file-preview ${previewUrl ? 'live' : ''}`}>{renderPreview()}</div>
					<div className="preview-meta">
						<StatusPill status={file.status} />
						{status && <p className="small-status">{status}</p>}
					</div>
				</div>
			</div>
		</div>
	);
}

export default function App() {
	const [files, setFiles] = useState([]);
	const [selectedFile, setSelectedFile] = useState(null);
	const [status, setStatus] = useState('');
	const [busy, setBusy] = useState(false);
	const [currentUser, setCurrentUser] = useState(null);
	const [authMode, setAuthMode] = useState('login');
	const [authError, setAuthError] = useState('');
	const [authBusy, setAuthBusy] = useState(false);
	const [authReady, setAuthReady] = useState(false);
	const [idToken, setIdToken] = useState('');
	const [showUploader, setShowUploader] = useState(false);
	const [showPreview, setShowPreview] = useState(false);
	const [previewUrl, setPreviewUrl] = useState('');
	const fileInputRef = useRef(null);
	const previewObjectUrl = useRef('');
	const decryptedNameRef = useRef('');
	const storageUsage = useMemo(() => {
		const quotaGb = 100;
		const usedBytes = files.reduce((total, file) => total + (file.size_bytes || 0), 0);
		const usedGb = usedBytes / 1024 ** 3;
		const percent = quotaGb ? Math.min((usedGb / quotaGb) * 100, 100) : 0;
		return {
			label: `${usedGb.toFixed(2)} GB of ${quotaGb} GB`,
			percent,
			usedGb,
			quotaGb,
			usedBytes,
		};
	}, [files]);

	const releasePreview = useCallback(() => {
		if (previewObjectUrl.current) {
			URL.revokeObjectURL(previewObjectUrl.current);
			previewObjectUrl.current = '';
		}
	}, []);

	useEffect(() => {
		const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
			setAuthReady(true);
			if (firebaseUser) {
				const token = await firebaseUser.getIdToken();
				setCurrentUser(firebaseUser);
				setIdToken(token);
			} else {
				setCurrentUser(null);
				setIdToken('');
				setFiles([]);
				setSelectedFile(null);
				setStatus('');
				setPreviewUrl('');
				setShowPreview(false);
				decryptedNameRef.current = '';
				releasePreview();
			}
		});
		return () => unsubscribe();
	}, [releasePreview]);

	useEffect(() => () => releasePreview(), [releasePreview]);

	useEffect(() => {
		if (authError && !authBusy) {
			const timer = setTimeout(() => setAuthError(''), 5000);
			return () => clearTimeout(timer);
		}
		return undefined;
	}, [authError, authBusy]);

	const authorizedFetch = useCallback(
		(path, options = {}) => {
			if (!idToken) {
				throw new Error('Missing auth token.');
			}
			const headers = new Headers(options.headers || {});
			headers.set('Authorization', `Bearer ${idToken}`);
			return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
		},
		[idToken],
	);

	const fetchFiles = useCallback(async () => {
		if (!idToken) {
			setFiles([]);
			return null;
		}
		try {
			const response = await authorizedFetch('/files');
			if (!response.ok) {
				throw new Error('Unable to load files.');
			}
			const data = await response.json();
			const list = Array.isArray(data.files) ? data.files : [];
			setFiles(list);
			return { files: list };
		} catch (error) {
			setStatus(error.message);
			return null;
		}
	}, [authorizedFetch, idToken]);

	useEffect(() => {
		if (idToken) {
			fetchFiles();
		}
	}, [fetchFiles, idToken]);

	const preparePreview = useCallback(
		async (file) => {
			if (!file) {
				return null;
			}
			setBusy(true);
			setStatus('Decrypting file...');
			try {
				const res = await authorizedFetch('/decrypt', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ filename: file.filename }),
				});
				if (!res.ok) {
					throw new Error('Decryption failed.');
				}
				const result = await res.json();
				decryptedNameRef.current = result.decrypted_filename;

				const downloadRes = await authorizedFetch(`/download/decrypted/${result.decrypted_filename}`);
				if (!downloadRes.ok) {
					throw new Error('Unable to load preview.');
				}
				const blob = await downloadRes.blob();
				releasePreview();
				const url = URL.createObjectURL(blob);
				previewObjectUrl.current = url;
				setPreviewUrl(url);
				setStatus(`Opened ${file.filename}.`);

				const refreshed = await fetchFiles();
				if (refreshed?.files) {
					const updatedEntry = refreshed.files.find((item) => item.filename === file.filename);
					if (updatedEntry) {
						setSelectedFile(updatedEntry);
					}
				}

				return result.decrypted_filename;
			} catch (error) {
				setStatus(error.message || 'Unable to open file.');
				throw error;
			} finally {
				setBusy(false);
			}
		},
		[authorizedFetch, fetchFiles, releasePreview],
	);

	const handleUploadClick = () => {
		setShowUploader(true);
	};

	const handleCloseUploader = () => {
		setShowUploader(false);
	};

	const handleBrowseClick = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = async (event) => {
		const file = event.target.files?.[0];
		if (!file) return;

		try {
			setShowUploader(false);
			setBusy(true);
			setStatus('Uploading file...');
			const formData = new FormData();
			formData.append('file', file);

			const uploadRes = await authorizedFetch('/upload', {
				method: 'POST',
				body: formData,
			});
			if (!uploadRes.ok) {
				throw new Error('Upload failed.');
			}
			const uploaded = await uploadRes.json();

			setStatus('Encrypting file...');
			const encryptRes = await authorizedFetch('/encrypt', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filename: uploaded.stored_filename }),
			});
			if (!encryptRes.ok) {
				throw new Error('Encryption failed.');
			}
			await encryptRes.json();

			const updated = await fetchFiles();
			const newest = updated?.files?.find((item) => item.filename === uploaded.stored_filename);
			if (newest) {
				setSelectedFile(newest);
				setStatus(`Encrypted ${newest.filename}.`);
			} else {
				setStatus('Encrypted file stored locally.');
			}
		} catch (error) {
			setStatus(error.message || 'Something went wrong.');
		} finally {
			event.target.value = '';
			setBusy(false);
		}
	};

	const handleFileSelect = useCallback(
		async (file) => {
			if (!file) {
				setSelectedFile(null);
				setShowPreview(false);
				return;
			}
			setSelectedFile(file);
			setShowPreview(true);
			decryptedNameRef.current = '';
			setPreviewUrl('');
			try {
				await preparePreview(file);
			} catch (error) {
				console.error(error);
			}
		},
		[preparePreview],
	);

	const handleClosePreview = useCallback(() => {
		setShowPreview(false);
	}, []);

	const handleDownload = useCallback(async () => {
		if (!selectedFile) {
			return;
		}
		try {
			if (!previewObjectUrl.current) {
				await preparePreview(selectedFile);
			}
			if (!previewObjectUrl.current) {
				throw new Error('Preview not ready.');
			}
			const anchor = document.createElement('a');
			anchor.href = previewObjectUrl.current;
			anchor.download = selectedFile.filename;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			setStatus(`Downloading ${selectedFile.filename}...`);
		} catch (error) {
			setStatus(error.message || 'Unable to download file.');
		}
	}, [preparePreview, selectedFile]);

	const handleShare = useCallback(async () => {
		if (!selectedFile) {
			return;
		}
		const message = `SecureCloud file ready: ${selectedFile.filename}`;
		try {
			if (typeof navigator !== 'undefined' && navigator.share) {
				await navigator.share({ title: 'SecureCloud File', text: message });
				return;
			}
			if (typeof navigator !== 'undefined' && navigator.clipboard) {
				await navigator.clipboard.writeText(message);
				setStatus('Share text copied to clipboard.');
				return;
			}
			setStatus('Sharing is not supported on this device.');
		} catch (error) {
			setStatus(error.message || 'Unable to share file.');
		}
	}, [selectedFile]);

	const handleEmailAuth = useCallback(
		async ({ email, password, name }) => {
			if (!email || !password) {
				setAuthError('Enter both email and password to continue.');
				return;
			}
			try {
				setAuthBusy(true);
				setAuthError('');
				if (authMode === 'login') {
					await signInWithEmailAndPassword(auth, email, password);
				} else {
					const credential = await createUserWithEmailAndPassword(auth, email, password);
					if (name) {
						await updateProfile(credential.user, { displayName: name });
					}
				}
			} catch (error) {
				setAuthError(friendlyAuthMessage(error));
			} finally {
				setAuthBusy(false);
			}
		},
		[authMode],
	);

	const handleGoogleAuth = useCallback(async () => {
		try {
			setAuthBusy(true);
			setAuthError('');
			await signInWithPopup(auth, googleProvider);
		} catch (error) {
			setAuthError(friendlyAuthMessage(error));
		} finally {
			setAuthBusy(false);
		}
	}, []);

	const handleLogout = useCallback(async () => {
		await signOut(auth);
	}, []);

	if (!authReady) {
		return (
			<div className="auth-shell">
				<div className="auth-card loading-state">
					<h2>SecureCloud</h2>
					<p className="muted">Loading your encrypted workspace...</p>
				</div>
			</div>
		);
	}

	if (!currentUser) {
		const sharedProps = {
			busy: authBusy,
			error: authError,
			onSubmit: handleEmailAuth,
			onGoogle: handleGoogleAuth,
		};

		return authMode === 'login' ? (
			<LoginForm {...sharedProps} onSwitch={() => setAuthMode('signup')} />
		) : (
			<SignupForm {...sharedProps} onSwitch={() => setAuthMode('login')} />
		);
	}

	return (
		<>
			<input type="file" ref={fileInputRef} onChange={handleFileChange} className="sr-only" />
			<UploadOverlay visible={showUploader} onClose={handleCloseUploader} onBrowse={handleBrowseClick} />
			<div className="app-shell">
				<Sidebar profile={currentUser} onLogout={handleLogout} storage={storageUsage} />
				<MainContent
					files={files}
					onUploadClick={handleUploadClick}
					onFileSelect={handleFileSelect}
					selectedFile={selectedFile}
					busy={busy}
					status={status}
				/>
			</div>
			<PreviewOverlay
				visible={showPreview && Boolean(selectedFile)}
				file={selectedFile}
				previewUrl={previewUrl}
				status={status}
				onDownload={handleDownload}
				onShare={handleShare}
				onClose={handleClosePreview}
				busy={busy}
			/>
		</>
	);
}
