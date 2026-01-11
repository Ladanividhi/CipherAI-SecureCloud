import { useEffect, useState, useCallback } from 'react';
import {
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { friendlyAuthMessage } from '../utils/formatters';

export default function useAuth() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [idToken, setIdToken] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');

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
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (authError && !authBusy) {
      const timer = setTimeout(() => setAuthError(''), 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [authError, authBusy]);

  const handleEmailAuth = useCallback(
    async ({ email, password, name }) => {
      if (!email || !password) {
        setAuthError('Enter both email and password to continue.');
        return;
      }
      try {
        setAuthBusy(true);
        setAuthError('');
        // Login or signup will be chosen by page routing; keep exact logic
        if (name === undefined || name === null) {
          // Treat as login when name not provided
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
    [],
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

  return {
    currentUser,
    authReady,
    idToken,
    authBusy,
    authError,
    setAuthError,
    handleEmailAuth,
    handleGoogleAuth,
    handleLogout,
  };
}
