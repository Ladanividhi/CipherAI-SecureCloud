// Formatting helpers moved from App.jsx (no logic changes)
export const formatBytes = (size) => {
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

export const formatDate = (iso) => {
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

export const friendlyAuthMessage = (error) => {
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
